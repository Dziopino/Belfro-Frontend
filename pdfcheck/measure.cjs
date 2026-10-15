const { jsPDF } = require('jspdf');
const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '../public/fonts');
const doc = new jsPDF({ unit: 'mm', format: 'a4' });
for (const [file, style] of [['DejaVuSans.ttf', 'normal'], ['DejaVuSans-Bold.ttf', 'bold']]) {
  doc.addFileToVFS(file, fs.readFileSync(path.join(dir, file)).toString('base64'));
  doc.addFont(file, 'belfero', style);
}

const HEAD = ['Lp.', 'Numer', 'Imię i nazwisko', 'Grupa', 'Punkty', '%', 'Ocena', 'Pewność AI', 'Status'];
const W = { plain: [10, 14, 52, 20, 16, 14, 18, 38], group: [10, 14, 40, 12, 20, 16, 14, 18, 38] };
const PAD = 4;

doc.setFont('belfero', 'bold');
doc.setFontSize(8.5);
for (const title of HEAD) {
  const need = doc.getTextWidth(title) + PAD;
  const inPlain = W.plain[HEAD.indexOf(title)];
  const inGroup = W.group[HEAD.indexOf(title)];
  console.log(
    `${title.padEnd(18)} potrzebne=${need.toFixed(2).padStart(6)} mm | bez grup=${String(inPlain).padStart(3)} ${inPlain >= need ? 'OK' : 'PĘKA'} | z grupami=${String(inGroup).padStart(3)} ${inGroup >= need ? 'OK' : 'PĘKA'}`
  );
}

doc.setFont('belfero', 'normal');
doc.setFontSize(9);
const SAMPLES = [['4', '21,5', '89,6%', 'Żaneta Łącka-Ślązak', 'Do weryfikacji nauczyciela', 'Wymaga weryfikacji']];
for (const s of SAMPLES[0]) {
  console.log(`treść 9pt: ${JSON.stringify(s)} → ${doc.getTextWidth(s).toFixed(2)} mm (+4 = ${(doc.getTextWidth(s) + PAD).toFixed(2)})`);
}
