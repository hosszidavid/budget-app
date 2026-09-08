"use client";

import { ItemAutocomplete } from "./ItemAutocomplete";
import { CategoryPicker } from "./CategoryPicker";
import { currencies } from "@/lib/money";
import { createClientId } from "@/lib/client-id";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Person={id:string;name:string};
type Category={id:string;name:string;parentId:string|null;depth:number;path:string;color?:string|null;amountBehavior:"NORMAL"|"NEGATIVE"|"POSITIVE"};
type Merchant={id:string;name:string};
type LineSource="MANUAL"|"AI"|"MAPPING";
type Component={rawLabel:string;label:string;amount:number;reusableItemId:string|null;categoryId:string|null;categoryPath:string;source:LineSource;confidence:number|null;isDairy:boolean;containsEgg:boolean;containsAnimal:boolean;isAlcohol:boolean;isFrozen:boolean;isCanned:boolean;isPackaged:boolean};
type Row={id:string;rawLabel:string;label:string;amount:string;reusableItemId:string|null;categoryId:string|null;categoryPath:string;note:string;source:LineSource;aiConfidence:number|null;isDairy:boolean;containsEgg:boolean;containsAnimal:boolean;isAlcohol:boolean;isFrozen:boolean;isCanned:boolean;isPackaged:boolean;rememberMapping:boolean;mappingScope:"merchant"|"global";components:Component[]};
type StructureAction={action:"MERGE"|"SPLIT";rawLabels:string[]};
type InitialReceipt={id:string;date:string;personId:string|null;merchant:string;currency:string;declaredTotal:number;note:string;status:"DRAFT"|"READY"|"SAVED";hasImage:boolean;aiModel:string|null;lines:Array<Omit<Row,"amount"|"rememberMapping"|"mappingScope">&{amount:number;rememberMapping?:boolean;mappingScope?:"merchant"|"global"}>};

function today(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
const roundMoney=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const moneyText=(n:number)=>roundMoney(n).toFixed(2);
const blank=(id:string=createClientId("receipt-line")):Row=>({id,rawLabel:"",label:"",amount:"",reusableItemId:null,categoryId:null,categoryPath:"",note:"",source:"MANUAL",aiConfidence:null,isDairy:false,containsEgg:false,containsAnimal:false,isAlcohol:false,isFrozen:false,isCanned:false,isPackaged:false,rememberMapping:false,mappingScope:"merchant",components:[]});

export function ReceiptForm({people,categories,merchants,initialReceipt,aiTimeoutSeconds}:{people:Person[];categories:Category[];merchants:Merchant[];initialReceipt?:InitialReceipt;aiTimeoutSeconds:number}){
 const router=useRouter(), fileRef=useRef<HTMLInputElement>(null);
 const [date,setDate]=useState(initialReceipt?.date??today());
 const [personId,setPersonId]=useState(initialReceipt?.personId??"");
 const [merchant,setMerchant]=useState(initialReceipt?.merchant??"");
 const [currency,setCurrency]=useState(initialReceipt?.currency??"CHF");
 const [declaredTotal,setDeclaredTotal]=useState(initialReceipt?moneyText(initialReceipt.declaredTotal):"");
 const [note,setNote]=useState(initialReceipt?.note??"");
 const [rows,setRows]=useState<Row[]>(initialReceipt?.lines.length?initialReceipt.lines.map(l=>({...l,amount:moneyText(l.amount),rememberMapping:l.rememberMapping??false,mappingScope:l.mappingScope??"merchant",components:Array.isArray(l.components)?l.components:[]})):[blank("initial")]);
 const [selected,setSelected]=useState<string[]>([]);const [structureActions,setStructureActions]=useState<StructureAction[]>([]);
 const [busy,setBusy]=useState<"draft"|"commit"|"delete"|"scan"|null>(null);const [error,setError]=useState("");const [scanWarning,setScanWarning]=useState("");const [scanSeconds,setScanSeconds]=useState(0);
 const [lastScanFile,setLastScanFile]=useState<File|null>(null);
 const [imageToken,setImageToken]=useState<string|null>(null);const [imageMimeType,setImageMimeType]=useState<string|null>(null);const [imageOriginalName,setImageOriginalName]=useState<string|null>(null);const [previewUrl,setPreviewUrl]=useState<string|null>(initialReceipt?.hasImage?`/api/receipts/${initialReceipt.id}/image`:null);const [aiModel,setAiModel]=useState<string|null>(initialReceipt?.aiModel??null);
 const [imageOpen,setImageOpen]=useState(false);const [imageZoom,setImageZoom]=useState(1);
 useEffect(()=>{if(busy!=="scan"){setScanSeconds(0);return}const started=Date.now();const timer=setInterval(()=>setScanSeconds(Math.floor((Date.now()-started)/1000)),1000);return()=>clearInterval(timer)},[busy]);
 const behavior=(categoryId:string|null)=>categories.find(c=>c.id===categoryId)?.amountBehavior??"NORMAL";
 const effectiveAmount=(r:Row)=>{const n=roundMoney(Number(r.amount)||0);const b=behavior(r.categoryId);return b==="NEGATIVE"?-Math.abs(n):b==="POSITIVE"?Math.abs(n):n};
 const processedTotal=useMemo(()=>rows.reduce((s,r)=>s+effectiveAmount(r),0),[rows,categories]);
 const discountTotal=useMemo(()=>rows.filter(r=>r.categoryPath.startsWith("Korrekciók › Kedvezmény")).reduce((s,r)=>s+effectiveAmount(r),0),[rows,categories]);
 const depositNet=useMemo(()=>rows.filter(r=>r.categoryPath.startsWith("Korrekciók › Pfand / betétdíj")).reduce((s,r)=>s+effectiveAmount(r),0),[rows,categories]);
 const declared=Number(declaredTotal)||0; const difference=declared-processedTotal; const unresolved=rows.filter(r=>r.label.trim()&&Number(r.amount)!==0&&!r.categoryId).length;
 const validLines=rows.filter(r=>r.label.trim()&&Number(r.amount)!==0); const hasMismatch=declared>0&&Math.abs(difference)>0.01; const canFinalize=validLines.length>0&&declared>0&&unresolved===0;
 const finalizeState=!validLines.length?{tone:"pending",text:"Lezáráshoz adj meg legalább egy tételt és összeget."}:declared<=0?{tone:"pending",text:"Lezáráshoz add meg a blokk végösszegét."}:unresolved>0?{tone:"pending",text:`Lezáráshoz még ${unresolved} tételt kategorizálj.`}:hasMismatch?{tone:"warning",text:`Lezárható eltéréssel · ${difference.toFixed(2)} ${currency}`}: {tone:"ready",text:"Lezárásra kész · minden tétel kategorizálva."};
 const patch=(id:string,v:Partial<Row>)=>setRows(rs=>rs.map(r=>r.id===id?{...r,...v}:r));
 const formatAmountInput=(value:string)=>{const n=Number(value);return Number.isFinite(n)?moneyText(n):value};
 const componentFromRow=(r:Row):Component=>({rawLabel:r.rawLabel,label:r.label,amount:Number(r.amount)||0,reusableItemId:r.reusableItemId,categoryId:r.categoryId,categoryPath:r.categoryPath,source:r.source,confidence:r.aiConfidence,isDairy:r.isDairy,containsEgg:r.containsEgg,containsAnimal:r.containsAnimal,isAlcohol:r.isAlcohol,isFrozen:r.isFrozen,isCanned:r.isCanned,isPackaged:r.isPackaged});
 const addStructureAction=(action:StructureAction)=>setStructureActions(actions=>[...actions,action]);

 function openImageWindow(){if(!previewUrl)return;const w=window.open(previewUrl,"_blank","noopener,noreferrer");if(!w)setError("A böngésző letiltotta az új ablakot. Engedélyezd a felugró ablakot ehhez az oldalhoz.");}

 async function scan(file:File){
  setError("");setScanWarning("");setLastScanFile(file);setBusy("scan");setSelected([]);setStructureActions([]);setImageOpen(false);setImageZoom(1);if(previewUrl&&previewUrl.startsWith("blob:"))URL.revokeObjectURL(previewUrl);setPreviewUrl(URL.createObjectURL(file));
  let res:Response;
  try{
   const initRes=await fetch("/api/receipts/upload/init",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:file.name||"receipt",type:file.type,size:file.size})});
   const init=await initRes.json().catch(()=>({}));
   if(!initRes.ok)throw new Error(init.error??"A blokkfeltöltés előkészítése nem sikerült.");
   if(init.mode==="blob"){
    const {upload}=await import("@vercel/blob/client");
    const blob=await upload(init.pathname,file,{access:"private",handleUploadUrl:"/api/receipts/upload",clientPayload:init.imageToken,multipart:file.size>4*1024*1024});
    const confirmRes=await fetch("/api/receipts/upload/confirm",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({imageToken:init.imageToken,blobUrl:blob.url})});
    const confirm=await confirmRes.json().catch(()=>({}));
    if(!confirmRes.ok)throw new Error(confirm.error??"A blokkfeltöltés megerősítése nem sikerült.");
    res=await fetch("/api/receipts/recognize",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({imageToken:init.imageToken})});
   }else{
    const form=new FormData();form.append("image",file);
    res=await fetch("/api/receipts/recognize",{method:"POST",body:form});
   }
  }catch(error){setBusy(null);return setError(error instanceof Error?error.message:"Nem sikerült kapcsolatot létesíteni a blokkfelismerővel.")}
  const body=await res.json().catch(()=>({}));setBusy(null);
  if(!res.ok)return setError(body.error??"A blokk felismerése nem sikerült.");
  setImageToken(body.imageToken);setImageMimeType(body.imageMimeType||file.type);setImageOriginalName(body.imageOriginalName||file.name);setAiModel(body.model?`${body.model}${body.api?` · ${body.api}`:""}`:null);
  if(body.date)setDate(body.date);if(body.merchant)setMerchant(body.merchant);if(body.currency)setCurrency(body.currency);if(Number(body.declaredTotal)>0)setDeclaredTotal(moneyText(Number(body.declaredTotal)));
  if(Array.isArray(body.lines)&&body.lines.length){
   setRows(body.lines.map((l:any)=>({id:createClientId("receipt-line"),rawLabel:l.rawLabel||"",label:l.label||"",amount:Number.isFinite(Number(l.amount))?moneyText(Number(l.amount)):"",reusableItemId:l.reusableItemId??null,categoryId:l.categoryId??null,categoryPath:l.categoryPath||"",note:"",source:l.source==="MAPPING"?"MAPPING":"AI",aiConfidence:typeof l.confidence==="number"?l.confidence:null,isDairy:!!l.isDairy,containsEgg:!!l.containsEgg,containsAnimal:!!l.containsAnimal,isAlcohol:!!l.isAlcohol,isFrozen:!!l.isFrozen,isCanned:!!l.isCanned,isPackaged:!!l.isPackaged,rememberMapping:false,mappingScope:"merchant",components:Array.isArray(l.components)?l.components:[]})));
  }else if(body.partialRecognition){
   setRows([blank("partial-recognition")]);
  }
  if(body.partialRecognition)setScanWarning(body.warning||"A végösszeg felismerhető volt, de a blokk tételeit nem sikerült kiolvasni.");
 }

 function splitRow(id:string){
  const row=rows.find(r=>r.id===id);if(!row||row.components.length<2)return;
  const rawLabels=row.components.map(c=>c.rawLabel).filter(Boolean);addStructureAction({action:"SPLIT",rawLabels});
  const children=row.components.map(c=>({id:createClientId("receipt-line"),rawLabel:c.rawLabel,label:c.label,amount:moneyText(Number(c.amount)),reusableItemId:c.reusableItemId,categoryId:c.categoryId,categoryPath:c.categoryPath||categories.find(x=>x.id===c.categoryId)?.path||"",note:"",source:c.source,aiConfidence:c.confidence,isDairy:c.isDairy,containsEgg:c.containsEgg,containsAnimal:c.containsAnimal,isAlcohol:c.isAlcohol,isFrozen:c.isFrozen,isCanned:c.isCanned,isPackaged:c.isPackaged,rememberMapping:false,mappingScope:"merchant" as const,components:[]}));
  setRows(current=>current.flatMap(r=>r.id===id?children:[r]));setSelected(current=>current.filter(v=>v!==id));
 }

 function mergeSelected(){
  const picked=rows.filter(r=>selected.includes(r.id));if(picked.length<2)return;
  const first=picked[0];const components=picked.flatMap(r=>r.components.length?r.components:[componentFromRow(r)]);const effective=picked.reduce((sum,r)=>sum+effectiveAmount(r),0);const firstBehavior=behavior(first.categoryId);const displayAmount=roundMoney(firstBehavior==="NORMAL"?effective:Math.abs(effective));
  const merged:Row={...first,id:createClientId("receipt-line"),rawLabel:components.map(c=>c.rawLabel).join(" + "),amount:moneyText(displayAmount),components,source:picked.every(r=>r.source==="MAPPING")?"MAPPING":"MANUAL",aiConfidence:Math.min(...picked.map(r=>r.aiConfidence??0.5)),rememberMapping:false};
  const firstIndex=rows.findIndex(r=>selected.includes(r.id));const selectedSet=new Set(selected);const next=rows.filter(r=>!selectedSet.has(r.id));next.splice(firstIndex,0,merged);setRows(next);setSelected([]);addStructureAction({action:"MERGE",rawLabels:components.map(c=>c.rawLabel)});
 }

 async function submit(action:"draft"|"commit"){
  setError("");if(!validLines.length)return setError("Adj meg legalább egy blokk-tételt és összeget.");if(declared<=0)return setError("Add meg a blokkon szereplő végösszeget.");if(action==="commit"&&unresolved>0)return setError("A lezáráshoz minden tételt kategorizálni kell.");
  if(action==="commit"&&hasMismatch&&!window.confirm(`A blokk nem egyezik. Eltérés: ${difference.toFixed(2)} ${currency}. Biztosan lezárod így is?`))return;
  setBusy(action);const editing=Boolean(initialReceipt?.id);const res=await fetch(editing?`/api/receipts/${initialReceipt!.id}`:"/api/receipts",{method:editing?"PUT":"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,date,personId:personId||null,merchant:merchant||null,currency,declaredTotal:declared,note:note||null,imageToken,imageMimeType,imageOriginalName,aiModel,structureActions,lines:validLines.map(({id,...r})=>({...r,amount:roundMoney(Number(r.amount))}))})});
  const body=await res.json().catch(()=>({}));setBusy(null);if(!res.ok)return setError(body.error??"Nem sikerült menteni a blokkot.");
  router.push(action==="draft"?`/app/add/receipt?id=${body.receiptId}`:`/app/receipts/${body.receiptId}`);router.refresh();
 }
 async function removeDraft(){if(!initialReceipt?.id)return;if(!window.confirm("Törlöd ezt a piszkozatot és a hozzá tartozó könyvelt kiadást is?"))return;setBusy("delete");const res=await fetch(`/api/receipts/${initialReceipt.id}`,{method:"DELETE"});setBusy(null);if(!res.ok){const b=await res.json().catch(()=>({}));return setError(b.error??"Nem sikerült törölni.")}router.push("/app/receipts");router.refresh()}
 return <div className="form-card receipt-form">
  {error&&<div className="error">{error}</div>}
  <div className="receipt-scan-panel">
   <div className="receipt-scan-copy"><span className="summary-label">AI Receipt Engine</span><strong>{initialReceipt?.hasImage||previewUrl?"Blokkfotó csatolva":"Fotózd le vagy töltsd fel a blokkot"}</strong><small>{busy==="scan"?`A Gemini elemzi a blokkot${scanSeconds?` · ${scanSeconds} mp`:""}. A kérés legfeljebb ${aiTimeoutSeconds} másodpercig vár.`:"A Gemini előtölti a boltot, dátumot, végösszeget és a kategorizált tételeket. Mentés előtt mindent ellenőrizhetsz."}</small></div>
   <input ref={fileRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={e=>{const f=e.target.files?.[0];if(f)scan(f)}}/>
   <button className="primary receipt-scan-button" type="button" disabled={Boolean(busy)} onClick={()=>fileRef.current?.click()}>{busy==="scan"?`Felismerés…${scanSeconds?` ${scanSeconds}s`:""}`:previewUrl?"Új fotó":"Blokk beolvasása"}</button>
  </div>
  {scanWarning&&<div className="warning receipt-partial-warning"><span>{scanWarning}</span>{lastScanFile&&<button className="secondary" type="button" disabled={Boolean(busy)} onClick={()=>scan(lastScanFile)}>Újrapróbálás</button>}</div>}
  {previewUrl&&<div className="receipt-image-review"><button className="receipt-image-thumb" type="button" onClick={()=>{setImageZoom(1);setImageOpen(true)}} aria-label="Blokkfotó megnyitása"><img src={previewUrl} alt="Blokk ellenőrző kép"/></button><div><strong>{initialReceipt?.status==="DRAFT"?"Piszkozat: a kép megmarad":"A kép a piszkozat mentéséig megmarad"}</strong><small>Lezáráskor az eredeti kép törlődik. Ellenőrzéshez nagyíthatod vagy külön ablakban is megnyithatod.</small>{aiModel&&<small>Felismerés: {aiModel}</small>}<div className="receipt-image-actions"><button className="secondary compact-button" type="button" onClick={()=>{setImageZoom(1);setImageOpen(true)}}>Kép megnyitása</button><button className="ghost compact-button" type="button" onClick={openImageWindow}>Új ablakban ↗</button></div></div></div>}
  <div className="receipt-booking-note"><strong>A piszkozat is könyvelt adat.</strong><span>Már beleszámít a havi kiadásokba és egyenlegbe, csak az eredeti blokkfotót tartjuk meg az ellenőrzéshez.</span></div>
  <div className="form-grid-2">
   <div className="field"><label>Dátum</label><input className="input" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
   <div className="field"><label>Személy</label><select className="select" value={personId} onChange={e=>setPersonId(e.target.value)}><option value="">Közös</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
   <div className="field"><label>Bolt / partner</label><input className="input" list="receipt-merchants" value={merchant} onChange={e=>setMerchant(e.target.value)} placeholder="pl. SPAR"/><datalist id="receipt-merchants">{merchants.map(m=><option key={m.id}>{m.name}</option>)}</datalist></div>
   <div className="field"><label>Valuta</label><select className="select" value={currency} onChange={e=>setCurrency(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select></div>
   <div className="field receipt-total-field"><label>Blokk végösszeg</label><div className="amount-with-currency"><input className="input" inputMode="decimal" value={declaredTotal} onChange={e=>setDeclaredTotal(e.target.value.replace(",","."))} onBlur={()=>setDeclaredTotal(formatAmountInput(declaredTotal))} placeholder="0.00"/><span>{currency}</span></div></div>
  </div>
  <div className="items-box receipt-items-box">
   <div className="panel-head receipt-lines-head"><div><h2>Blokk tételei</h2><p className="muted section-note">Az összevont tételek bármikor szétszedhetők. Több külön tételt kijelölve össze is vonhatsz. A legutóbbi Split/Merge döntést a rendszer megjegyzi.</p></div></div>
   {rows.map((r,index)=><div className={`item-card receipt-line-card ${r.label&&r.amount&&!r.categoryId?"unresolved-line":""}`} key={r.id}>
    <div className="receipt-line-select"><input aria-label={`${index+1}. tétel kijelölése`} type="checkbox" checked={selected.includes(r.id)} onChange={e=>setSelected(current=>e.target.checked?[...current,r.id]:current.filter(v=>v!==r.id))}/></div><div className="receipt-line-index">{index+1}</div>
    <div className="receipt-line-status"><span className="receipt-line-status-label">Felismerés</span><span className="receipt-source-badges">{r.source==="MAPPING"&&<span className="receipt-source-badge mapping">Saját szabály</span>}{r.source==="AI"&&<span className={`receipt-source-badge ai ${r.aiConfidence!=null&&r.aiConfidence<0.7?"low":""}`}>AI{r.aiConfidence!=null?` ${Math.round(r.aiConfidence*100)}%`:""}</span>}{r.source==="MANUAL"&&r.rawLabel.trim()&&<span className="receipt-source-badge manual">Kézzel javított</span>}{(!r.categoryId||(r.source==="AI"&&r.aiConfidence!=null&&r.aiConfidence<0.7))&&<span className="receipt-source-badge review">Ellenőrizendő</span>}</span></div>
    <div className="field raw-label-field"><label>Eredeti blokkszöveg <span className="optional-label">opcionális</span></label><input className="input raw-label" value={r.rawLabel} onChange={e=>patch(r.id,{rawLabel:e.target.value,source:"MANUAL",rememberMapping:Boolean(e.target.value.trim()&&r.categoryId)})} placeholder="pl. APFEL GALA"/></div>
    {r.components.length>1&&<div className="receipt-structure-strip"><span><strong>{r.components.length} összevont termék</strong> · {r.components.map(c=>c.rawLabel).join(" · ")}</span><button className="secondary compact-button" type="button" onClick={()=>splitRow(r.id)}>Split</button></div>}
    <div className="receipt-entry-grid">
      <div className="receipt-product-field"><label className="mini-label">Költségvetési tétel</label><ItemAutocomplete flowSuggestions value={r} onChange={v=>{const d=v.defaults??{};patch(r.id,{label:v.label,reusableItemId:v.reusableItemId??null,categoryId:v.categoryId??null,categoryPath:v.categoryPath??"",source:"MANUAL",rememberMapping:Boolean(r.rawLabel.trim()),mappingScope:"merchant",isDairy:!!d.isDairy,containsEgg:!!d.containsEgg,containsAnimal:!!d.containsAnimal,isAlcohol:!!d.isAlcohol,isFrozen:!!d.isFrozen,isCanned:!!d.isCanned,isPackaged:!!d.isPackaged})}}/></div>
      <div className="receipt-amount-field"><label className="mini-label">Összeg</label><input className="input amount-input" inputMode="decimal" value={r.amount} onChange={e=>patch(r.id,{amount:e.target.value.replace(",","."),source:"MANUAL"})} onBlur={()=>patch(r.id,{amount:formatAmountInput(r.amount)})} placeholder="0.00"/></div>
      <button className="ghost danger-link remove-row" type="button" aria-label="Tétel törlése" onClick={()=>{setRows(rs=>rs.length===1?[blank()]:rs.filter(x=>x.id!==r.id));setSelected(s=>s.filter(v=>v!==r.id))}}>×</button>
      <div className="receipt-category-field"><span className="mini-label">Kategória</span><CategoryPicker compact categories={categories} value={r.categoryId} allowClear onChange={categoryId=>{const c=categoryId?categories.find(x=>x.id===categoryId):undefined;patch(r.id,{categoryId,categoryPath:c?.path??"",source:"MANUAL",rememberMapping:Boolean(r.rawLabel.trim()),mappingScope:"merchant"})}}/></div>
    </div>
    <div className="attribute-panel receipt-attributes">{r.categoryPath.startsWith("Étel és ital")&&<div className="attr-row compact-attributes">{[["isDairy","Tejtermék"],["containsEgg","Tojás"],["containsAnimal","Állati"],["isAlcohol","Alkoholos"],["isFrozen","Fagyasztott"],["isCanned","Konzerv"],["isPackaged","Csomagolt"]].map(([key,label])=><label className="check-chip" key={key}><input type="checkbox" checked={Boolean(r[key as keyof Row])} onChange={e=>patch(r.id,{[key]:e.target.checked,source:"MANUAL",rememberMapping:Boolean(r.rawLabel.trim())} as Partial<Row>)}/>{label}</label>)}</div>}{r.rawLabel.trim()&&<div className="ai-learning-row"><label className="check-chip learning-chip"><input type="checkbox" checked={r.rememberMapping} onChange={e=>patch(r.id,{rememberMapping:e.target.checked})}/>Jegyezze meg ezt a javítást</label>{r.rememberMapping&&<select className="select mapping-scope" value={r.mappingScope} onChange={e=>patch(r.id,{mappingScope:e.target.value as "merchant"|"global"})}><option value="merchant">Csak ennél a boltnál</option><option value="global">Minden boltnál</option></select>}</div>}{categories.find(c=>c.id===r.categoryId)?.amountBehavior==="NEGATIVE"&&<div className="correction-hint">− Negatív korrekció: az összeg automatikusan levonódik.</div>}</div>
   </div>)}
  </div>
  {structureActions.length>0&&<div className="structure-learning-note"><strong>{structureActions.length} strukturális javítás vár mentésre.</strong><span>A legutóbbi Split/Merge döntés lesz aktív ugyanarra a termékkombinációra.</span></div>}
  {(discountTotal!==0||depositNet!==0)&&<div className="receipt-corrections-summary">{discountTotal!==0&&<span><small>Kedvezmények</small><strong>{discountTotal.toFixed(2)} {currency}</strong></span>}{depositNet!==0&&<span><small>Pfand nettó</small><strong>{depositNet.toFixed(2)} {currency}</strong></span>}<em>A korrekciók már a feldolgozott végösszeg részei.</em></div>}
  <div className={`receipt-reconcile ${!hasMismatch&&unresolved===0?"receipt-match":declared>0?"receipt-mismatch":""}`}>
   <div><span>Blokk végösszeg</span><strong>{declared.toFixed(2)} {currency}</strong></div><div><span>Hozzáadott kiadások</span><strong>{processedTotal.toFixed(2)} {currency}</strong></div><div><span>Eltérés</span><strong>{difference.toFixed(2)} {currency} {!hasMismatch&&declared>0?"✓":declared>0?"⚠":""}</strong></div><div><span>Feldolgozott tételek</span><strong>{validLines.length}</strong></div><div><span>Nincs kategorizálva</span><strong>{unresolved}</strong></div>
  </div>
  <div className="field" style={{marginTop:18}}><label>Megjegyzés</label><textarea className="textarea" value={note} onChange={e=>setNote(e.target.value)} placeholder="Opcionális"/></div>
  <div className={`receipt-finalize-state ${finalizeState.tone}`}><span className="receipt-finalize-dot"/><strong>{finalizeState.text}</strong></div>
  <div className="receipt-actions"><button className="secondary" disabled={Boolean(busy)} onClick={()=>submit("draft")}>{busy==="draft"?"Mentés…":"Piszkozat mentése"}</button><button className="primary" title={!canFinalize?finalizeState.text:undefined} disabled={Boolean(busy)||!canFinalize} onClick={()=>submit("commit")}>{busy==="commit"?"Lezárás…":hasMismatch?"Lezárás eltéréssel":"Blokk lezárása"}</button>{initialReceipt?.id&&<button className="ghost danger-link" disabled={Boolean(busy)} onClick={removeDraft}>{busy==="delete"?"Törlés…":"Piszkozat törlése"}</button>}</div>
  {unresolved>0&&declared>0&&<p className="muted receipt-gate-note">A piszkozat menthető és teljes értékű kiadásként számít, de a végleges lezáráshoz a {unresolved} kategorizálatlan tételt rendezd.</p>}
  {hasMismatch&&unresolved===0&&<p className="muted receipt-gate-note">Az eltérés nem blokkolja a lezárást. A rendszer figyelmeztet és a blokk később is mismatch-ként lesz látható.</p>}
  <div className="receipt-floating-actions" aria-label="Blokk tétel műveletek">
   {previewUrl&&<button className="secondary receipt-floating-image" type="button" disabled={Boolean(busy)} onClick={()=>{setImageZoom(1);setImageOpen(true)}}>Kép</button>}
   <button className="secondary receipt-floating-merge" type="button" disabled={selected.length<2||Boolean(busy)} onClick={mergeSelected}>Merge{selected.length?` (${selected.length})`:""}</button>
   <button className="primary receipt-floating-add" type="button" disabled={Boolean(busy)} onClick={()=>setRows(r=>[...r,blank()])}>+ Tétel</button>
  </div>
  {imageOpen&&previewUrl&&<div className="receipt-image-modal" role="dialog" aria-modal="true" aria-label="Blokkfotó"><div className="receipt-image-modal-toolbar"><div className="receipt-image-zoom"><button className="secondary compact-button" type="button" onClick={()=>setImageZoom(z=>Math.max(.5,Math.round((z-.25)*100)/100))}>−</button><strong>{Math.round(imageZoom*100)}%</strong><button className="secondary compact-button" type="button" onClick={()=>setImageZoom(z=>Math.min(4,Math.round((z+.25)*100)/100))}>+</button><button className="ghost compact-button" type="button" onClick={()=>setImageZoom(1)}>100%</button></div><div><button className="secondary compact-button" type="button" onClick={openImageWindow}>Új ablakban ↗</button><button className="primary compact-button" type="button" onClick={()=>setImageOpen(false)}>Bezárás</button></div></div><div className="receipt-image-stage" onDoubleClick={()=>setImageZoom(z=>z===1?2:1)}><img src={previewUrl} alt="Blokkfotó nagyítva" style={{width:`${imageZoom*100}%`}}/></div></div>}
 </div>
}
