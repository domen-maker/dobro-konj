exports.handler = async function(event) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({error:"Method not allowed"}) };

  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY ni nastavljen.");

    const b = JSON.parse(event.body || "{}");
    for (const k of ["name","tax","address","post","place","date","signature","pdfHtml"]) {
      if (!b[k]) throw new Error("Manjka podatek: " + k);
    }
    if (!/^\d{8}$/.test(String(b.tax))) throw new Error("Neveljavna davčna številka.");

    // Generate the actual PDF from the submitted HTML using a public HTML-to-PDF service
    // would introduce another dependency/service. Instead, create a self-contained HTML
    // attachment named .html that browsers can print perfectly to PDF? No: user asked PDF.
    // We therefore use PDFShift only if configured; otherwise send signature PNG + complete HTML.
    // To guarantee a real PDF without another credential, build a minimal PDF ourselves.
    const pdf = makeSimplePdf(b);

    const pngBase64 = String(b.signature).replace(/^data:image\/png;base64,/, "");
    const pdfBase64 = Buffer.from(pdf).toString("base64");

    const emailHtml = `
      <h2>Nova zahteva za namenitev 1 % dohodnine</h2>
      <p><b>Ime in priimek:</b> ${e(b.name)}<br>
      <b>Davčna številka:</b> ${e(b.tax)}<br>
      <b>Naslov:</b> ${e(b.address)}<br>
      <b>Pošta:</b> ${e(b.post)}<br>
      <b>Kraj:</b> ${e(b.place)}<br>
      <b>Datum:</b> ${e(b.date)}</p>
      <p><b>Upravičenec:</b> Društvo za razvoj slovenskega konjeništva<br>
      <b>Davčna številka upravičenca:</b> 66123615<br>
      <b>Odstotek:</b> 1,0 odstotka</p>
      <p>V priponki sta PDF obrazec in slika podpisa.</p>`;

    const rr = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Obrazec dohodnina <onboarding@resend.dev>",
        to: ["domen@bbr.si"],
        subject: "Nova zahteva za namenitev 1 % dohodnine – PDF",
        html: emailHtml,
        attachments: [
          { filename: "DohDon_obrazec.pdf", content: pdfBase64 },
          { filename: "podpis.png", content: pngBase64 }
        ]
      })
    });
    const txt = await rr.text();
    if (!rr.ok) throw new Error("Resend: " + txt);
    return { statusCode: 200, headers, body: JSON.stringify({ok:true}) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({error:String(err.message || err)}) };
  }
};

function e(v){ return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

// Minimal dependency-free A4 PDF. It contains all submitted textual data.
// The handwritten signature is attached separately as podpis.png in the same email.
function makeSimplePdf(b){
  const lines = [
    "OBRAZEC ZA NAMENITEV DELA DOHODNINE ZA DONACIJE",
    "",
    "Ime in priimek: " + ascii(b.name),
    "Davcna stevilka: " + ascii(b.tax),
    "Naslov: " + ascii(b.address),
    "Posta: " + ascii(b.post),
    "Kraj: " + ascii(b.place),
    "Datum: " + ascii(b.date),
    "",
    "Upravicenec: Drustvo za razvoj slovenskega konjenistva",
    "Davcna stevilka upravicenca: 66123615",
    "Odstotek: 1,0 odstotka",
    "",
    "Podpis zavezanca je prilozen e-posti kot podpis.png."
  ];
  const content = ["BT","/F1 11 Tf","50 790 Td"];
  lines.forEach((line,i)=>{
    if(i) content.push("0 -22 Td");
    content.push("(" + pdfEscape(line) + ") Tj");
  });
  content.push("ET");
  const stream = content.join("\n");
  const objs = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objs[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>";
  objs[4] = "<< /Length " + Buffer.byteLength(stream,"latin1") + " >>\nstream\n" + stream + "\nendstream";
  objs[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  let pdf="%PDF-1.4\n", offsets=[0];
  for(let i=1;i<=5;i++){ offsets[i]=Buffer.byteLength(pdf,"latin1"); pdf += i+" 0 obj\n"+objs[i]+"\nendobj\n"; }
  const xref=Buffer.byteLength(pdf,"latin1");
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  for(let i=1;i<=5;i++) pdf += String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  pdf += "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF";
  return Buffer.from(pdf,"latin1");
}
function ascii(s){
  return String(s??"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^\x20-\x7E]/g,"?");
}
function pdfEscape(s){ return String(s).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)"); }
