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
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      throw new Error("RESEND_API_KEY ni nastavljen.");
    }

    const b = JSON.parse(event.body || "{}");

    for (const k of [
      "name",
      "tax",
      "address",
      "post",
      "place",
      "date",
      "signature",
    ]) {
      if (!b[k]) {
        throw new Error("Manjka podatek: " + k);
      }
    }

    if (!/^\d{8}$/.test(String(b.tax))) {
      throw new Error("Neveljavna davčna številka.");
    }

    // ---------------------------------------------------------
    // IZDELAVA PDF
    // ---------------------------------------------------------

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    // Pisava je v isti mapi kot ta funkcija:
    // netlify/functions/NotoSans-Regular.ttf
    const fontPath = path.join(__dirname, "NotoSans-Regular.ttf");
    const fontBytes = fs.readFileSync(fontPath);
    const font = await pdfDoc.embedFont(fontBytes, { subset: true });

    const page = pdfDoc.addPage([595.28, 841.89]);

    const black = rgb(0, 0, 0);
    const gray = rgb(0.96, 0.96, 0.96);

    function text(txt, x, y, size = 10) {
      page.drawText(String(txt ?? ""), {
        x,
        y,
        size,
        font,
        color: black,
      });
    }

    function line(x1, y1, x2, y2, width = 0.8) {
      page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness: width,
        color: black,
      });
    }

    function box(x, y, width, height, fill = false) {
      page.drawRectangle({
        x,
        y,
        width,
        height,
        borderWidth: 0.8,
        borderColor: black,
        ...(fill ? { color: gray } : {}),
      });
    }

    function field(label, value, x, y, width) {
      text(label, x, y + 27, 9);
      box(x, y, width, 23);
      text(value, x + 7, y + 7, 10);
    }

    const left = 55;
    const contentWidth = 485;

    // NASLOV
    text(
      "OBRAZEC za zahtevo za namenitev dela dohodnine za donacije",
      74,
      790,
      13
    );

    line(left, 775, left + contentWidth, 775, 1);

    // PODATKI ZAVEZANCA
    box(left, 735, contentWidth, 28, true);
    text(
      "VAŠI PODATKI (podatki zavezanca)",
      left + 10,
      744,
      11
    );

    field("Ime in priimek", b.name, left, 690, contentWidth);
    field("Davčna številka", b.tax, left, 645, contentWidth);

    field(
      "Naselje, ulica in hišna številka",
      b.address,
      left,
      600,
      contentWidth
    );

    field(
      "Poštna številka in ime pošte",
      b.post,
      left,
      555,
      contentWidth
    );

    // UPRAVIČENEC
    box(left, 505, contentWidth, 28, true);
    text("PODATKI O UPRAVIČENCU", left + 10, 514, 11);

    const col1 = 270;
    const col2 = 125;
    const col3 = 90;

    box(left, 470, col1, 30, true);
    box(left + col1, 470, col2, 30, true);
    box(left + col1 + col2, 470, col3, 30, true);

    text("Ime oziroma naziv upravičenca", left + 7, 481, 8);
    text("Davčna številka", left + col1 + 7, 481, 8);
    text("Odstotek (%)", left + col1 + col2 + 7, 481, 8);

    box(left, 425, col1, 45);
    box(left + col1, 425, col2, 45);
    box(left + col1 + col2, 425, col3, 45);

    text(
      "Društvo za razvoj slovenskega",
      left + 7,
      449,
      9
    );

    text(
      "konjeništva",
      left + 7,
      435,
      9
    );

    text("66123615", left + col1 + 20, 441, 10);
    text("1,0 %", left + col1 + col2 + 27, 441, 10);

    // KRAJ IN DATUM
    field("V/Na (kraj)", b.place, left, 355, 225);
    field("Dne (datum)", b.date, left + 260, 355, 225);

    // PODPIS
    text("Podpis zavezanca", left, 320, 9);
    box(left, 175, contentWidth, 135);

    const pngBase64 = String(b.signature).replace(
      /^data:image\/png;base64,/,
      ""
    );

    const signatureBytes = Buffer.from(pngBase64, "base64");
    const signatureImage = await pdfDoc.embedPng(signatureBytes);

    const originalWidth = signatureImage.width;
    const originalHeight = signatureImage.height;

    const maxWidth = 430;
    const maxHeight = 105;

    const scale = Math.min(
      maxWidth / originalWidth,
      maxHeight / originalHeight
    );

    const sigWidth = originalWidth * scale;
    const sigHeight = originalHeight * scale;

    page.drawImage(signatureImage, {
      x: left + (contentWidth - sigWidth) / 2,
      y: 190 + (100 - sigHeight) / 2,
      width: sigWidth,
      height: sigHeight,
    });

    text(
      "Izpolnjen obrazec za namenitev dela dohodnine za donacije.",
      left,
      135,
      8
    );

    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    // ---------------------------------------------------------
    // E-POŠTA
    // ---------------------------------------------------------

    const emailHtml = `
      <h2>Nova zahteva za namenitev 1 % dohodnine</h2>

      <p>
        <b>Ime in priimek:</b> ${esc(b.name)}<br>
        <b>Davčna številka:</b> ${esc(b.tax)}<br>
        <b>Naslov:</b> ${esc(b.address)}<br>
        <b>Pošta:</b> ${esc(b.post)}<br>
        <b>Kraj:</b> ${esc(b.place)}<br>
        <b>Datum:</b> ${esc(b.date)}
      </p>

      <p>
        <b>Upravičenec:</b> Društvo za razvoj slovenskega konjeništva<br>
        <b>Davčna številka upravičenca:</b> 66123615<br>
        <b>Odstotek:</b> 1,0 %
      </p>

      <p>V priponki je izpolnjen obrazec s podpisom zavezanca.</p>
    `;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Obrazec dohodnina <onboarding@resend.dev>",
        to: ["domen@bbr.si"],
        subject: "Nova zahteva za namenitev 1 % dohodnine – PDF",
        html: emailHtml,
        attachments: [
          {
            filename: "DohDon_obrazec.pdf",
            content: pdfBase64,
          },
        ],
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.message ||
        result.error ||
        "Resend napaka HTTP " + response.status
      );
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        success: true,
        id: result.id,
      }),
    };
  } catch (e) {
    console.error(e);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: e.message || String(e),
      }),
    };
  }
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, function (c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
}
