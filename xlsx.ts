/** Minimal dependency-free XLSX writer for one worksheet using inline strings. */
function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k=0;k<8;k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(entries: Array<{ name: string; data: Buffer }>) {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = entry.data;
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50,0); header.writeUInt16LE(20,4); header.writeUInt16LE(0,6); header.writeUInt16LE(0,8);
    header.writeUInt16LE(0,10); header.writeUInt16LE(0x21,12); header.writeUInt32LE(crc,14); header.writeUInt32LE(data.length,18); header.writeUInt32LE(data.length,22); header.writeUInt16LE(name.length,26); header.writeUInt16LE(0,28);
    local.push(header,name,data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50,0); c.writeUInt16LE(20,4); c.writeUInt16LE(20,6); c.writeUInt16LE(0,8); c.writeUInt16LE(0,10);
    c.writeUInt16LE(0,12); c.writeUInt16LE(0x21,14); c.writeUInt32LE(crc,16); c.writeUInt32LE(data.length,20); c.writeUInt32LE(data.length,24); c.writeUInt16LE(name.length,28); c.writeUInt16LE(0,30); c.writeUInt16LE(0,32); c.writeUInt16LE(0,34); c.writeUInt16LE(0,36); c.writeUInt32LE(0,38); c.writeUInt32LE(offset,42);
    central.push(c,name);
    offset += header.length + name.length + data.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(0,4); end.writeUInt16LE(0,6); end.writeUInt16LE(entries.length,8); end.writeUInt16LE(entries.length,10); end.writeUInt32LE(centralBuffer.length,12); end.writeUInt32LE(offset,16); end.writeUInt16LE(0,20);
  return Buffer.concat([...local,centralBuffer,end]);
}

function xml(value: unknown) { return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;"); }
function column(index: number) { let s=""; for(let n=index+1;n;n=Math.floor((n-1)/26)) s=String.fromCharCode(65+(n-1)%26)+s; return s; }

export function makeXlsx(rows: Array<Array<string | number>>) {
  const rowXml = rows.map((row,ri)=>`<row r="${ri+1}">${row.map((value,ci)=>{
    const ref=`${column(ci)}${ri+1}`;
    return typeof value === "number" && Number.isFinite(value)
      ? `<c r="${ref}"><v>${value}</v></c>`
      : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }).join("")}</row>`).join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Transactions" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  return zipStore([
    {name:"[Content_Types].xml",data:Buffer.from(types)},
    {name:"_rels/.rels",data:Buffer.from(rels)},
    {name:"xl/workbook.xml",data:Buffer.from(workbook)},
    {name:"xl/_rels/workbook.xml.rels",data:Buffer.from(workbookRels)},
    {name:"xl/worksheets/sheet1.xml",data:Buffer.from(sheet)},
  ]);
}
