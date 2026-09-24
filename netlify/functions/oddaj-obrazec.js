const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const fs = require("fs");
const path = require("path");

exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Method not allowed",
      }),
    };
  }

  try {
    // ---------------------------------------------------------
    // 1. API KLJUČ
    // ---------------------------------------------------------

    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      throw new Error("RESEND_API_KEY ni nastavljen.");
    }

    // ---------------------------------------------------------
    // 2. PREJEM PODATKOV
    // ---------------------------------------------------------

    const b = JSON.parse(event.body || "{}");

    const required = [
      "name",
      "tax",
      "address",
      "post",
      "place",
      "date",
      "signature",
    ];

    for (const key of required) {
      if (!b[key] || !String(b[key]).trim()) {
        throw new Error("Manjka podatek: " + key);
      }
    }

    const tax = String(b.tax).trim();

    if (!/^\d{8}$/.test(tax)) {
      throw new Error("Davčna številka mora vsebovati 8 številk.");
    }

    // ---------------------------------------------------------
    // 3. USTVARJANJE PDF
    // ---------------------------------------------------------

    const pdfDoc = await PDFDocument.create();

    pdfDoc.registerFontkit(fontkit);

    // NotoSans-Regular.ttf je v korenu GitHub repozitorija.
    const fontPath = path.resolve(
      __dirname,
      "..",
      "..",
      "NotoSans-Regular.ttf"
    );

    if (!fs.existsSync(fontPath)) {
      throw new Error(
        "Pisave NotoSans-Regular.ttf ni mogoče najti: " + fontPath
      );
    }

    const fontBytes = fs.readFileSync(fontPath);

    // Pisavo vdelamo v celoti - brez subset:true.
    const font = await pdfDoc.embedFont(fontBytes);

    const page = pdfDoc.addPage([595.28, 841.89]);

    const BLACK = rgb(0, 0, 0);
    const LIGHT = rgb(0.94, 0.94, 0.94);
    const WHITE = rgb(1, 1, 1);

    const LEFT = 50;
    const WIDTH = 495;

    // ---------------------------------------------------------
    // POMOŽNE FUNKCIJE
    // ---------------------------------------------------------

    function drawText(value, x, y, size = 10) {
      page.drawText(String(value ?? ""), {
        x,
        y,
        size,
        font,
        color: BLACK,
      });
    }

    function drawCentered(value, y, size = 10) {
      const valueString = String(value ?? "");
      const textWidth = font.widthOfTextAtSize(
        valueString,
        size
      );

      page.drawText(valueString, {
        x: (595.28 - textWidth) / 2,
        y,
        size,
        font,
        color: BLACK,
      });
    }

    function rectangle(
      x,
      y,
      width,
      height,
      fillColor = WHITE,
      borderWidth = 0.8
    ) {
      page.drawRectangle({
        x,
        y,
        width,
        height,
        color: fillColor,
        borderColor: BLACK,
        borderWidth,
      });
    }

    function sectionTitle(title, y) {
      rectangle(
        LEFT,
        y,
        WIDTH,
        28,
        LIGHT,
        0.8
      );

      drawText(
        title,
        LEFT + 10,
        y + 9,
        10
      );
    }

    function field(label, value, x, y, width) {
      drawText(label, x, y + 29, 8.5);

      rectangle(
        x,
        y,
        width,
        24,
        WHITE,
        0.8
      );

      drawText(
        value,
        x + 7,
        y + 7,
        10
      );
    }

    // ---------------------------------------------------------
    // 4. NASLOV
    // ---------------------------------------------------------

    drawCentered(
      "OBRAZEC",
      790,
      15
    );

    drawCentered(
      "za zahtevo za namenitev dela dohodnine za donacije",
      770,
      10
    );

    page.drawLine({
      start: { x: LEFT, y: 752 },
      end: { x: LEFT + WIDTH, y: 752 },
      thickness: 1,
      color: BLACK,
    });

    // ---------------------------------------------------------
    // 5. PODATKI ZAVEZANCA
    // ---------------------------------------------------------

    sectionTitle(
      "VAŠI PODATKI (podatki zavezanca)",
      710
    );

    field(
      "Ime in priimek",
      b.name,
      LEFT,
      660,
      WIDTH
    );

    field(
      "Davčna številka",
      tax,
      LEFT,
      615,
      WIDTH
    );

    field(
      "Naselje, ulica in hišna številka",
      b.address,
      LEFT,
      570,
      WIDTH
    );

    field(
      "Poštna številka in ime pošte",
      b.post,
      LEFT,
      525,
      WIDTH
    );

    // ---------------------------------------------------------
    // 6. UPRAVIČENEC
    // ---------------------------------------------------------

    sectionTitle(
      "PODATKI O UPRAVIČENCU",
      475
    );

    const col1 = 280;
    const col2 = 125;
    const col3 = 90;

    // Glava tabele

    rectangle(
      LEFT,
      438,
      col1,
      30,
      LIGHT
    );

    rectangle(
      LEFT + col1,
      438,
      col2,
      30,
      LIGHT
    );

    rectangle(
      LEFT + col1 + col2,
      438,
      col3,
      30,
      LIGHT
    );

    drawText(
      "Ime oziroma naziv upravičenca",
      LEFT + 7,
      449,
      8
    );

    drawText(
      "Davčna številka",
      LEFT + col1 + 7,
      449,
      8
    );

    drawText(
      "Odstotek (%)",
      LEFT + col1 + col2 + 7,
      449,
      8
    );

    // Vsebina tabele

    rectangle(
      LEFT,
      390,
      col1,
      48,
      WHITE
    );

    rectangle(
      LEFT + col1,
      390,
      col2,
      48,
      WHITE
    );

    rectangle(
      LEFT + col1 + col2,
      390,
      col3,
      48,
      WHITE
    );

    drawText(
      "Društvo za razvoj slovenskega",
      LEFT + 7,
      416,
      9
    );

    drawText(
      "konjeništva",
      LEFT + 7,
      401,
      9
    );

    drawText(
      "66123615",
      LEFT + col1 + 22,
      407,
      10
    );

    drawText(
      "1,0 %",
      LEFT + col1 + col2 + 27,
      407,
      10
    );

    // ---------------------------------------------------------
    // 7. KRAJ IN DATUM
    // ---------------------------------------------------------

    field(
      "V/Na (kraj)",
      b.place,
      LEFT,
      325,
      235
    );

    field(
      "Dne (datum)",
      b.date,
      LEFT + 260,
      325,
      235
    );

    // ---------------------------------------------------------
    // 8. PODPIS
    // ---------------------------------------------------------

    drawText(
      "Podpis zavezanca",
      LEFT,
      290,
      9
    );

    const signatureBoxY = 135;
    const signatureBoxHeight = 140;

    rectangle(
      LEFT,
      signatureBoxY,
      WIDTH,
      signatureBoxHeight,
      WHITE
    );

    const signatureData = String(
      b.signature
    );

    if (
      !signatureData.startsWith(
        "data:image/png;base64,"
      )
    ) {
      throw new Error(
        "Podpis ni v pričakovani PNG obliki."
      );
    }

    const pngBase64 =
      signatureData.replace(
        /^data:image\/png;base64,/,
        ""
      );

    const signatureBytes =
      Buffer.from(
        pngBase64,
        "base64"
      );

    const signatureImage =
      await pdfDoc.embedPng(
        signatureBytes
      );

    const maxSigWidth = WIDTH - 40;
    const maxSigHeight =
      signatureBoxHeight - 30;

    const scale = Math.min(
      maxSigWidth / signatureImage.width,
      maxSigHeight / signatureImage.height,
      1
    );

    const sigWidth =
      signatureImage.width * scale;

    const sigHeight =
      signatureImage.height * scale;

    const sigX =
      LEFT +
      (WIDTH - sigWidth) / 2;

    const sigY =
      signatureBoxY +
      (signatureBoxHeight - sigHeight) / 2;

    page.drawImage(
      signatureImage,
      {
        x: sigX,
        y: sigY,
        width: sigWidth,
        height: sigHeight,
      }
    );

    // ---------------------------------------------------------
    // 9. SPODNJA OPOMBA
    // ---------------------------------------------------------

    drawCentered(
      "Zahteva za namenitev dela dohodnine za donacije",
      100,
      8
    );

    // ---------------------------------------------------------
    // 10. SHRANJEVANJE PDF
    // ---------------------------------------------------------

    const pdfBytes =
      await pdfDoc.save();

    const pdfBase64 =
      Buffer.from(
        pdfBytes
      ).toString("base64");

    // ---------------------------------------------------------
    // 11. E-POŠTA
    // ---------------------------------------------------------

    const emailHtml = `
      <h2>Nova zahteva za namenitev 1 % dohodnine</h2>

      <p>
        <b>Ime in priimek:</b> ${esc(b.name)}<br>
        <b>Davčna številka:</b> ${esc(tax)}<br>
        <b>Naslov:</b> ${esc(b.address)}<br>
        <b>Pošta:</b> ${esc(b.post)}<br>
        <b>Kraj:</b> ${esc(b.place)}<br>
        <b>Datum:</b> ${esc(b.date)}
      </p>

      <p>
        <b>Upravičenec:</b>
        Društvo za razvoj slovenskega konjeništva<br>
        <b>Davčna številka upravičenca:</b>
        66123615<br>
        <b>Odstotek:</b> 1,0 %
      </p>

      <p>
        Izpolnjen in podpisan obrazec je priložen
        temu sporočilu kot PDF.
      </p>
    `;

    const response =
      await fetch(
        "https://api.resend.com/emails",
        {
          method: "POST",

          headers: {
            Authorization:
              "Bearer " + apiKey,
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            from:
              "Obrazec dohodnina <onboarding@resend.dev>",

            to: [
              "domen@bbr.si",
            ],

            subject:
              "Nova zahteva za namenitev 1 % dohodnine",

            html: emailHtml,

            attachments: [
              {
                filename:
                  "DohDon_obrazec.pdf",
                content:
                  pdfBase64,
              },
            ],
          }),
        }
      );

    let result;

    try {
      result =
        await response.json();
    } catch {
      result = {};
    }

    if (!response.ok) {
      throw new Error(
        result.message ||
        result.error ||
        "Resend napaka HTTP " +
          response.status
      );
    }

    // ---------------------------------------------------------
    // 12. USPEŠEN ODGOVOR SPLETNEMU OBRAZCU
    // ---------------------------------------------------------

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        success: true,
        id: result.id || null,
      }),
    };
  } catch (error) {
    console.error(
      "ODDAJ-OBRAZEC ERROR:",
      error
    );

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        success: false,
        error:
          error.message ||
          String(error),
      }),
    };
  }
};


// -----------------------------------------------------------
// HTML ESCAPE ZA VSEBINO E-POŠTE
// -----------------------------------------------------------

function esc(value) {
  return String(
    value ?? ""
  ).replace(
    /[&<>"']/g,
    function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[character];
    }
  );
}
