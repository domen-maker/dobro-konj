const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

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

    const page = pdfDoc.addPage([595.28, 841.89]);

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const black = rgb(0, 0, 0);

    function text(txt, x, y, size = 11, useBold = false) {
      page.drawText(String(txt), {
        x,
        y,
        size,
        font: useBold ? bold : font,
        color: black,
      });
    }

    // NASLOV
    text(
      "OBRAZEC ZA NAMENITEV DELA DOHODNINE ZA DONACIJE",
      105,
      785,
      14,
      true
    );

    // PODATKI ZAVEZANCA
    text("Ime in priimek:", 70, 730, 11, true);
    text(b.name, 175, 730);

    text("Davcna stevilka:", 70, 705, 11, true);
    text(b.tax, 175, 705);

    text("Naslov:", 70, 680, 11, true);
    text(b.address, 175, 680);

    text("Posta:", 70, 655, 11, true);
    text(b.post, 175, 655);

    text("Kraj:", 70, 630, 11, true);
    text(b.place, 175, 630);

    text("Datum:", 70, 605, 11, true);
    text(b.date, 175, 605);

    // UPRAVICENEC
    text("Upravicenec:", 70, 550, 11, true);
    text(
      "Drustvo za razvoj slovenskega konjenistva",
      175,
      550
    );

    text("Davcna stevilka upravicenca:", 70, 525, 11, true);
    text("66123615", 245, 525);

    text("Odstotek:", 70, 500, 11, true);
    text("1,0 %", 175, 500);

    // PODPIS
    text("Podpis zavezanca:", 70, 435, 11, true);

    const pngBase64 = String(b.signature).replace(
      /^data:image\/png;base64,/,
      ""
    );

    const signatureBytes = Buffer.from(pngBase64, "base64");
    const signatureImage = await pdfDoc.embedPng(signatureBytes);

    const originalWidth = signatureImage.width;
    const originalHeight = signatureImage.height;

    const maxWidth = 360;
    const maxHeight = 110;

    const scale = Math.min(
      maxWidth / originalWidth,
      maxHeight / originalHeight
    );

    const sigWidth = originalWidth * scale;
    const sigHeight = originalHeight * scale;

    page.drawImage(signatureImage, {
      x: 70,
      y: 300,
      width: sigWidth,
      height: sigHeight,
    });

    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    // ---------------------------------------------------------
    // E-POSTA
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

      <p>
        V priponki je izpolnjen obrazec s podpisom zavezanca.
      </p>
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

        // SAMO ENA PRIPONKA
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
        id: result.id,
      }),
    };
  } catch (e) {
    console.error(e);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
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
