import { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "firebase/firestore";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const STATUSES = ["Pending","Sent","Completed","Cancelled","Rescheduled"];
const STATUS_COLORS = {
  Pending:     { bg:"#dbeafe", text:"#1e40af", border:"#3b82f6" },
  Sent:        { bg:"#f3e8ff", text:"#6b21a8", border:"#a855f7" },
  Completed:   { bg:"#dcfce7", text:"#166534", border:"#22c55e" },
  Cancelled:   { bg:"#fee2e2", text:"#991b1b", border:"#ef4444" },
  Rescheduled: { bg:"#fef9c3", text:"#854d0e", border:"#f59e0b" },
};

const DRIVE_SECTIONS = [
  { id:"quotes",    icon:"📋", label:"QUOTES",    title:"Quotes",    link:"" },
  { id:"invoices",  icon:"🧾", label:"INVOICES",  title:"Invoices",  link:"" },
  { id:"tgs",       icon:"🗺️", label:"TGS",       title:"TGS",       link:"" },
  { id:"utes",      icon:"🚐", label:"UTES",      title:"Utes",      link:"" },
  { id:"equipment", icon:"🔧", label:"EQUIP",     title:"Equipment", link:"" },
  { id:"documents", icon:"📁", label:"DOCS",      title:"Documents", link:"" },
];

const TIMES = [];
for (var th = 0; th < 24; th++) {
  for (var tm = 0; tm < 60; tm += 30) {
    var ap = th < 12 ? "am" : "pm";
    var hr = th === 0 ? 12 : th > 12 ? th - 12 : th;
    TIMES.push(hr + ":" + (tm === 0 ? "00" : "30") + ap);
  }
}

var emptyJob = { day:"Monday", date:"", client:"", time:"", address:"", workOrderRef:"", teamLeader:"", ute2:"", ute3:"", workers:[], uteCount:1, notes:"", status:"Pending", emailsSent:false, invoiceSent:false };
var INP = { width:"100%", background:"#f8fafc", border:"1px solid #cbd5e1", borderRadius:"6px", color:"#1a2e1a", padding:"8px 10px", fontSize:"13px", outline:"none", boxSizing:"border-box" };
var LBL = { color:"#166534", fontSize:"11px", fontWeight:"700", letterSpacing:"0.8px", textTransform:"uppercase", marginBottom:"4px", display:"block" };

function formatDate(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var dd = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + dd;
}

function getMonthDays(year, month) {
  var first = new Date(year, month, 1);
  var last = new Date(year, month + 1, 0);
  var dow = first.getDay();
  var offset = dow === 0 ? 6 : dow - 1;
  var days = [];
  for (var i = offset; i > 0; i--) days.push({ date: new Date(year, month, 1 - i), current: false });
  for (var i = 1; i <= last.getDate(); i++) days.push({ date: new Date(year, month, i), current: true });
  var next = 1;
  while (days.length % 7 !== 0) days.push({ date: new Date(year, month + 1, next++), current: false });
  return days;
}

function getBusy(jobs, day, excludeId) {
  var busy = {};
  jobs.forEach(function(j) {
    if (j.day === day && j.id !== excludeId && j.status !== "Cancelled") {
      if (j.teamLeader) busy[j.teamLeader] = true;
      if (j.ute2) busy[j.ute2] = true;
      if (j.ute3) busy[j.ute3] = true;
      (Array.isArray(j.workers) ? j.workers : []).forEach(function(n) { busy[n] = true; });
    }
  });
  return busy;
}

function DriveSection(props) {
  var section = props.section;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flex:1, padding:"40px 20px" }}>
      <div style={{ background:"#fff", borderRadius:"16px", padding:"40px", maxWidth:"480px", width:"100%", border:"1px solid #bbf7d0", boxShadow:"0 2px 12px rgba(0,0,0,0.06)", textAlign:"center" }}>
        <div style={{ fontSize:"56px", marginBottom:"16px" }}>{section.icon}</div>
        <h2 style={{ color:"#166534", fontFamily:"monospace", fontSize:"20px", fontWeight:"700", margin:"0 0 8px 0" }}>{section.title}</h2>
        <p style={{ color:"#64748b", fontSize:"13px", marginBottom:"24px", lineHeight:1.6 }}>
          This section links to your Google Drive folder.<br/>
          Share the folder link to connect it here.
        </p>
        {section.link ? (
          <a href={section.link} target="_blank" rel="noreferrer" style={{ display:"inline-flex", alignItems:"center", gap:"8px", background:"linear-gradient(135deg,#166534,#14532d)", color:"#fff", borderRadius:"8px", padding:"12px 24px", fontSize:"14px", fontWeight:"700", textDecoration:"none" }}>
            <span>📂</span> Open in Google Drive
          </a>
        ) : (
          <div style={{ background:"#f0fdf4", border:"2px dashed #bbf7d0", borderRadius:"10px", padding:"20px" }}>
            <p style={{ color:"#94a3b8", fontSize:"12px", margin:"0 0 8px 0" }}>No Drive folder linked yet.</p>
            <p style={{ color:"#166534", fontSize:"12px", fontWeight:"600", margin:0 }}>Create the folder in Google Drive and we'll link it here!</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Modal(props) {
  var job = props.job;
  var initWorkers = Array.isArray(job.workers) ? job.workers.slice() : [];
  var init = {};
  for (var k in emptyJob) init[k] = emptyJob[k];
  for (var k in job) init[k] = job[k];
  init.workers = initWorkers;
  var sf = useState(init); var form = sf[0]; var setForm = sf[1];
  var busy = getBusy(props.allJobs || [], form.day, job.id || null);
  var workers = Array.isArray(form.workers) ? form.workers : [];

  function setF(k, v) { setForm(function(f) { var n = Object.assign({}, f); n[k] = v; return n; }); }
  function toggleWorker(name) {
    var w = workers.slice();
    var idx = w.indexOf(name);
    if (idx >= 0) w.splice(idx, 1); else w.push(name);
    setF("workers", w);
  }

  return (
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.55)", zIndex:9999, overflowY:"auto" }}>
      <div style={{ background:"#fff", borderRadius:"12px", padding:"20px", maxWidth:"500px", margin:"30px auto", boxShadow:"0 10px 40px rgba(0,0,0,0.2)", border:"1px solid #bbf7d0" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" }}>
          <h2 style={{ color:"#166534", margin:0, fontSize:"16px", fontFamily:"monospace" }}>{job.id ? "Edit Job" : "New Job"}</h2>
          <button onClick={props.onClose} style={{ background:"none", border:"none", fontSize:"24px", cursor:"pointer", color:"#94a3b8", lineHeight:1 }}>×</button>
        </div>
        <div style={{ marginBottom:"12px" }}><label style={LBL}>Client</label><input style={INP} value={form.client} onChange={function(e){setF("client",e.target.value);}} placeholder="Ex: Kwikflo, Ventia..." /></div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"12px" }}>
          <div><label style={LBL}>Day</label><select style={INP} value={form.day} onChange={function(e){setF("day",e.target.value);}}>{DAYS.map(function(d){return <option key={d} value={d}>{d}</option>;})}</select></div>
          <div><label style={LBL}>Date</label><input style={INP} type="date" value={form.date} onChange={function(e){setF("date",e.target.value);}} /></div>
          <div><label style={LBL}>Time on site</label><select style={INP} value={form.time} onChange={function(e){setF("time",e.target.value);}}><option value="">Select...</option>{TIMES.map(function(t){return <option key={t} value={t}>{t}</option>;})}</select></div>
          <div><label style={LBL}>Status</label><select style={INP} value={form.status} onChange={function(e){setF("status",e.target.value);}}>{STATUSES.map(function(s){return <option key={s} value={s}>{s}</option>;})}</select></div>
        </div>
        <div style={{ marginBottom:"12px" }}><label style={LBL}>Address</label><input style={INP} value={form.address} onChange={function(e){setF("address",e.target.value);}} placeholder="Ex: 2 Wilson St Chatswood" /></div>
        <div style={{ marginBottom:"12px" }}><label style={LBL}>Work Order Ref</label><input style={INP} value={form.workOrderRef} onChange={function(e){setF("workOrderRef",e.target.value);}} placeholder="Ex: WOR201300821144" /></div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"12px" }}>
          <div><label style={LBL}>Team Leader (1st Ute)</label><select style={INP} value={form.teamLeader} onChange={function(e){setF("teamLeader",e.target.value);}}><option value="">Select...</option>{(props.tls||[]).map(function(n){var b=busy[n]&&form.teamLeader!==n;return <option key={n} value={n} disabled={!!b}>{b?n+" (busy)":n}</option>;})}</select></div>
          <div><label style={LBL}>2nd Ute</label><select style={INP} value={form.ute2||""} onChange={function(e){setF("ute2",e.target.value);}}><option value="">None</option>{(props.tls||[]).map(function(n){var b=busy[n]&&form.ute2!==n;return <option key={n} value={n} disabled={!!b}>{b?n+" (busy)":n}</option>;})}</select></div>
          <div><label style={LBL}>3rd Ute</label><select style={INP} value={form.ute3||""} onChange={function(e){setF("ute3",e.target.value);}}><option value="">None</option>{(props.tls||[]).map(function(n){var b=busy[n]&&form.ute3!==n;return <option key={n} value={n} disabled={!!b}>{b?n+" (busy)":n}</option>;})}</select></div>
          <div><label style={LBL}>Nr Utes</label><input style={INP} type="number" min="1" value={form.uteCount} onChange={function(e){setF("uteCount",Number(e.target.value));}} /></div>
        </div>
        <div style={{ marginBottom:"12px" }}>
          <label style={LBL}>TCs on crew {Object.keys(busy).length>0?"• strikethrough = busy":""}</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"6px", marginTop:"6px" }}>
            {(props.tcs||[]).map(function(name) {
              var sel = workers.indexOf(name) >= 0;
              var isBusy = !sel && !!busy[name];
              return <div key={name} onClick={function(){if(!isBusy)toggleWorker(name);}} style={{ padding:"4px 10px", borderRadius:"20px", fontSize:"12px", cursor:isBusy?"default":"pointer", background:sel?"#166534":isBusy?"#f1f5f9":"#f0fdf4", color:sel?"#fff":isBusy?"#cbd5e1":"#166534", border:"1px solid "+(sel?"#166534":isBusy?"#e2e8f0":"#bbf7d0"), userSelect:"none", textDecoration:isBusy?"line-through":"none", opacity:isBusy?0.5:1 }}>{name}</div>;
            })}
          </div>
          <div style={{ color:"#64748b", fontSize:"11px", marginTop:"6px" }}>{workers.length} TCs selected</div>
        </div>
        <div style={{ marginBottom:"16px" }}><label style={LBL}>Notes</label><textarea style={{ width:"100%", background:"#f8fafc", border:"1px solid #cbd5e1", borderRadius:"6px", color:"#1a2e1a", padding:"8px 10px", fontSize:"13px", outline:"none", boxSizing:"border-box", minHeight:"70px", resize:"vertical" }} value={form.notes} onChange={function(e){setF("notes",e.target.value);}} placeholder="Ex: $120 travel paid..." /></div>
        <div style={{ display:"flex", gap:"10px" }}>
          <button onClick={props.onClose} style={{ flex:1, background:"#f1f5f9", border:"1px solid #cbd5e1", color:"#64748b", borderRadius:"6px", padding:"12px", fontSize:"13px", cursor:"pointer" }}>Cancel</button>
          <button onClick={function(){props.onSave(form);}} style={{ flex:2, background:"linear-gradient(135deg,#166534,#14532d)", border:"none", color:"#fff", borderRadius:"6px", padding:"12px", fontSize:"13px", cursor:"pointer", fontWeight:"700" }}>Save Job</button>
        </div>
      </div>
    </div>
  );
}

function JobCard(props) {
  var job = props.job;
  var sc = STATUS_COLORS[job.status] || STATUS_COLORS.Pending;
  var workers = Array.isArray(job.workers) ? job.workers : [];
  var utes = [job.teamLeader, job.ute2, job.ute3].filter(Boolean);
  var mapsUrl = "https://maps.google.com/?q=" + encodeURIComponent(job.address || "");
  return (
    <div style={{ background:"#fff", border:"1px solid "+sc.border+"44", borderLeft:"4px solid "+sc.border, borderRadius:"8px", padding:"14px 16px", marginBottom:"10px", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"8px", flexWrap:"wrap", gap:"6px" }}>
        <div><span style={{ color:"#166534", fontFamily:"monospace", fontSize:"14px", fontWeight:"700" }}>{job.client}</span><span style={{ color:"#94a3b8", fontSize:"12px", marginLeft:"10px" }}>{job.date}</span></div>
        <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
          <span style={{ background:sc.bg, color:sc.text, borderRadius:"4px", fontSize:"10px", fontWeight:"700", padding:"2px 8px", textTransform:"uppercase" }}>{job.status}</span>
          <button onClick={function(){props.onEdit(job);}} style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", color:"#166534", borderRadius:"4px", padding:"3px 8px", fontSize:"11px", cursor:"pointer" }}>Edit</button>
          <button onClick={function(){props.onDelete(job.id);}} style={{ background:"#fff0f0", border:"1px solid #fecaca", color:"#ef4444", borderRadius:"4px", padding:"3px 8px", fontSize:"11px", cursor:"pointer" }}>✕</button>
        </div>
      </div>
      <div style={{ fontSize:"12px", marginBottom:"6px" }}>
        <span style={{ color:"#3b82f6", fontWeight:"600" }}>{job.time}</span>
        {job.address?<span><span style={{ color:"#cbd5e1", margin:"0 6px" }}>|</span><a href={mapsUrl} target="_blank" rel="noreferrer" style={{ color:"#166534" }}>📍 {job.address}</a></span>:null}
        {job.workOrderRef?<span style={{ color:"#94a3b8", fontSize:"11px", marginLeft:"8px" }}>({job.workOrderRef})</span>:null}
      </div>
      {utes.length>0?<div style={{ fontSize:"12px", marginBottom:"6px" }}>{utes.map(function(u,i){return <span key={i} style={{ marginRight:"10px" }}><span style={{ color:"#166534", fontWeight:"600" }}>🚐 {u}</span><span style={{ color:"#94a3b8", fontSize:"10px", marginLeft:"3px" }}>({i===0?"1st":i===1?"2nd":"3rd"} ute)</span></span>;})}</div>:null}
      {workers.length>0?<div style={{ display:"flex", flexWrap:"wrap", gap:"4px", marginBottom:"8px" }}>{workers.map(function(w){return <span key={w} style={{ background:"#f0fdf4", color:"#166534", borderRadius:"10px", fontSize:"11px", padding:"2px 8px", border:"1px solid #bbf7d0" }}>{w}</span>;})}<span style={{ color:"#94a3b8", fontSize:"11px", alignSelf:"center", marginLeft:"4px" }}>{workers.length}TC / {job.uteCount} ute{job.uteCount>1?"s":""}</span></div>:null}
      {job.notes?<div style={{ color:"#64748b", fontSize:"11px", fontStyle:"italic", marginBottom:"8px", borderLeft:"3px solid #bbf7d0", padding:"6px 8px", background:"#f0fdf4", borderRadius:"0 4px 4px 0" }}>{job.notes}</div>:null}
      <div style={{ display:"flex", gap:"16px", marginTop:"8px", paddingTop:"8px", borderTop:"1px solid #f1f5f9" }}>
        <div onClick={function(){props.onToggle(job.id,"emailsSent");}} style={{ display:"flex", alignItems:"center", gap:"6px", cursor:"pointer" }}>
          <div style={{ width:"18px", height:"18px", borderRadius:"4px", background:job.emailsSent?"#22c55e":"#f1f5f9", border:"2px solid "+(job.emailsSent?"#22c55e":"#cbd5e1"), display:"flex", alignItems:"center", justifyContent:"center" }}>{job.emailsSent?<span style={{ color:"#fff", fontSize:"11px" }}>✓</span>:null}</div>
          <span style={{ color:job.emailsSent?"#22c55e":"#94a3b8", fontSize:"12px" }}>Emails sent</span>
        </div>
        <div onClick={function(){props.onToggle(job.id,"invoiceSent");}} style={{ display:"flex", alignItems:"center", gap:"6px", cursor:"pointer" }}>
          <div style={{ width:"18px", height:"18px", borderRadius:"4px", background:job.invoiceSent?"#3b82f6":"#f1f5f9", border:"2px solid "+(job.invoiceSent?"#3b82f6":"#cbd5e1"), display:"flex", alignItems:"center", justifyContent:"center" }}>{job.invoiceSent?<span style={{ color:"#fff", fontSize:"11px" }}>✓</span>:null}</div>
          <span style={{ color:job.invoiceSent?"#3b82f6":"#94a3b8", fontSize:"12px" }}>Invoice sent</span>
        </div>
      </div>
    </div>
  );
}

function MonthView(props) {
  var jobs = props.jobs; var year = props.year; var month = props.month;
  var days = getMonthDays(year, month);
  var todayStr = formatDate(new Date());
  var byDate = {};
  jobs.forEach(function(j){ if(j.date){if(!byDate[j.date])byDate[j.date]=[];byDate[j.date].push(j);} });
  return (
    <div style={{ flex:1, overflow:"auto" }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", background:"#f0fdf4", borderBottom:"2px solid #bbf7d0" }}>
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(function(d){return <div key={d} style={{ padding:"8px 4px", textAlign:"center", fontSize:"11px", fontWeight:"700", color:"#166534", fontFamily:"monospace" }}>{d}</div>;})}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)" }}>
        {days.map(function(day, idx) {
          var ds = formatDate(day.date);
          var dj = byDate[ds] || [];
          var isToday = ds === todayStr;
          var dowName = DAYS[day.date.getDay()===0?6:day.date.getDay()-1];
          return (
            <div key={idx} style={{ minHeight:"110px", border:"1px solid #e2e8f0", background:day.current?"#fff":"#f9fafb", padding:"4px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"3px" }}>
                <span style={{ width:"22px", height:"22px", borderRadius:"50%", background:isToday?"#166534":"transparent", color:isToday?"#fff":day.current?"#374151":"#cbd5e1", fontSize:"12px", fontWeight:isToday?"700":"400", display:"flex", alignItems:"center", justifyContent:"center" }}>{day.date.getDate()}</span>
                <span onClick={function(){props.onAdd(ds, dowName);}} style={{ color:"#22c55e", fontSize:"18px", cursor:"pointer", lineHeight:1, opacity:0.8 }}>+</span>
              </div>
              {dj.slice(0,3).map(function(job){
                var sc=STATUS_COLORS[job.status]||STATUS_COLORS.Pending;
                return <div key={job.id} onClick={function(){props.onEdit(job);}} style={{ background:sc.bg, borderLeft:"2px solid "+sc.border, borderRadius:"2px", padding:"1px 4px", marginBottom:"2px", cursor:"pointer", fontSize:"10px", color:sc.text, fontWeight:"600", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job.time?" "+job.time:""} {job.client}</div>;
              })}
              {dj.length>3?<div style={{ fontSize:"9px", color:"#94a3b8", paddingLeft:"2px" }}>+{dj.length-3} more</div>:null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView(props) {
  var jobs = props.jobs;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:"8px", padding:"12px" }}>
      {DAYS.map(function(day) {
        var dj = jobs.filter(function(j){return j.day===day;});
        var count = dj.filter(function(j){return j.status!=="Cancelled";}).length;
        return (
          <div key={day} style={{ background:"#fff", borderRadius:"8px", border:"1px solid #bbf7d0", minHeight:"200px", overflow:"hidden" }}>
            <div style={{ background:"#166534", padding:"8px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ color:"#fff", fontSize:"11px", fontWeight:"700", fontFamily:"monospace" }}>{day.slice(0,3).toUpperCase()}</span>
              {count>0?<span style={{ background:"rgba(255,255,255,0.3)", color:"#fff", borderRadius:"10px", fontSize:"10px", fontWeight:"700", padding:"1px 6px" }}>{count}</span>:null}
            </div>
            <div style={{ padding:"6px" }}>
              {dj.map(function(job){
                var sc=STATUS_COLORS[job.status]||STATUS_COLORS.Pending;
                return <div key={job.id} onClick={function(){props.onEdit(job);}} style={{ background:sc.bg, borderLeft:"3px solid "+sc.border, borderRadius:"4px", padding:"4px 6px", marginBottom:"4px", cursor:"pointer" }}><div style={{ color:sc.text, fontWeight:"700", fontSize:"11px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job.client}</div><div style={{ color:"#64748b", fontSize:"10px" }}>{job.time}</div></div>;
              })}
              <div onClick={function(){props.onAdd(null,day);}} style={{ color:"#22c55e", fontSize:"22px", textAlign:"center", cursor:"pointer", marginTop:"4px" }}>+</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TeamPage(props) {
  var s1=useState(""); var newTL=s1[0]; var setNewTL=s1[1];
  var s2=useState(""); var newTC=s2[0]; var setNewTC=s2[1];
  var sinp = { flex:1, background:"#f8fafc", border:"1px solid #cbd5e1", borderRadius:"6px", color:"#1a2e1a", padding:"8px 10px", fontSize:"13px", outline:"none", boxSizing:"border-box" };
  var addBtn = { background:"linear-gradient(135deg,#166534,#14532d)", border:"none", color:"#fff", borderRadius:"6px", padding:"8px 16px", fontSize:"13px", cursor:"pointer", fontWeight:"700" };
  return (
    <div style={{ padding:"16px", maxWidth:"600px", margin:"0 auto" }}>
      <div style={{ background:"#fff", borderRadius:"10px", padding:"16px", marginBottom:"16px", border:"1px solid #bbf7d0", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
        <h3 style={{ color:"#166534", fontFamily:"monospace", fontSize:"14px", margin:"0 0 12px 0" }}>🚐 TEAM LEADERS</h3>
        <div style={{ display:"flex", gap:"8px", marginBottom:"12px" }}>
          <input style={sinp} value={newTL} onChange={function(e){setNewTL(e.target.value);}} placeholder="Add team leader name..." onKeyDown={function(e){if(e.key==="Enter"&&newTL.trim()){props.onAddTL(newTL.trim());setNewTL("");}}} />
          <button style={addBtn} onClick={function(){if(newTL.trim()){props.onAddTL(newTL.trim());setNewTL("");}}}>Add</button>
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:"8px" }}>
          {props.tls.map(function(tl){return <div key={tl.id} style={{ display:"flex", alignItems:"center", gap:"6px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:"20px", padding:"5px 12px" }}><span style={{ color:"#166534", fontSize:"13px", fontWeight:"600" }}>{tl.name}</span><span onClick={function(){props.onDeleteTL(tl.id);}} style={{ color:"#ef4444", cursor:"pointer", fontSize:"18px", lineHeight:1 }}>×</span></div>;})}
          {props.tls.length===0?<span style={{ color:"#94a3b8", fontSize:"13px" }}>No team leaders yet.</span>:null}
        </div>
      </div>
      <div style={{ background:"#fff", borderRadius:"10px", padding:"16px", border:"1px solid #bbf7d0", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
        <h3 style={{ color:"#166534", fontFamily:"monospace", fontSize:"14px", margin:"0 0 12px 0" }}>👷 TRAFFIC CONTROLLERS</h3>
        <div style={{ display:"flex", gap:"8px", marginBottom:"12px" }}>
          <input style={sinp} value={newTC} onChange={function(e){setNewTC(e.target.value);}} placeholder="Add TC name..." onKeyDown={function(e){if(e.key==="Enter"&&newTC.trim()){props.onAddTC(newTC.trim());setNewTC("");}}} />
          <button style={addBtn} onClick={function(){if(newTC.trim()){props.onAddTC(newTC.trim());setNewTC("");}}}>Add</button>
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:"8px" }}>
          {props.tcs.map(function(tc){return <div key={tc.id} style={{ display:"flex", alignItems:"center", gap:"6px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:"20px", padding:"5px 12px" }}><span style={{ color:"#166534", fontSize:"13px" }}>{tc.name}</span><span onClick={function(){props.onDeleteTC(tc.id);}} style={{ color:"#ef4444", cursor:"pointer", fontSize:"18px", lineHeight:1 }}>×</span></div>;})}
          {props.tcs.length===0?<span style={{ color:"#94a3b8", fontSize:"13px" }}>No TCs yet.</span>:null}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  var s1=useState([]); var jobs=s1[0]; var setJobs=s1[1];
  var s2=useState([]); var tlDocs=s2[0]; var setTlDocs=s2[1];
  var s3=useState([]); var tcDocs=s3[0]; var setTcDocs=s3[1];
  var s4=useState("Monday"); var activeDay=s4[0]; var setActiveDay=s4[1];
  var s5=useState(null); var editing=s5[0]; var setEditing=s5[1];
  var s6=useState(true); var loading=s6[0]; var setLoading=s6[1];
  var s7=useState("bookings"); var tab=s7[0]; var setTab=s7[1];
  var s8=useState("month"); var viewMode=s8[0]; var setViewMode=s8[1];
  var now=new Date();
  var s9=useState(now.getFullYear()); var calYear=s9[0]; var setCalYear=s9[1];
  var s10=useState(now.getMonth()); var calMonth=s10[0]; var setCalMonth=s10[1];

  useEffect(function(){
    var q=query(collection(db,"jobs"),orderBy("date","asc"));
    var unsub=onSnapshot(q,function(snap){setJobs(snap.docs.map(function(d){return Object.assign({id:d.id},d.data());}));setLoading(false);});
    return unsub;
  },[]);

  useEffect(function(){
    var u1=onSnapshot(collection(db,"teamleaders"),function(snap){setTlDocs(snap.docs.map(function(d){return Object.assign({id:d.id},d.data());}));});
    var u2=onSnapshot(collection(db,"tcs"),function(snap){setTcDocs(snap.docs.map(function(d){return Object.assign({id:d.id},d.data());}));});
    return function(){u1();u2();};
  },[]);

  var tlNames=tlDocs.map(function(t){return t.name;});
  var tcNames=tcDocs.map(function(t){return t.name;});

  function saveJob(form){
    if(form.id){var id=form.id;var data=Object.assign({},form);delete data.id;updateDoc(doc(db,"jobs",id),data).then(function(){setEditing(null);});}
    else{addDoc(collection(db,"jobs"),form).then(function(){setEditing(null);});}
  }
  function deleteJob(id){if(window.confirm("Delete this job?"))deleteDoc(doc(db,"jobs",id));}
  function toggle(id,field){var job=jobs.find(function(j){return j.id===id;});var u={};u[field]=!job[field];updateDoc(doc(db,"jobs",id),u);}
  function openNew(dateStr,dayName){var j=Object.assign({},emptyJob);if(dateStr)j.date=dateStr;j.day=dayName||activeDay;setEditing(j);}
  function prevMonth(){if(calMonth===0){setCalMonth(11);setCalYear(calYear-1);}else setCalMonth(calMonth-1);}
  function nextMonth(){if(calMonth===11){setCalMonth(0);setCalYear(calYear+1);}else setCalMonth(calMonth+1);}
  function addTL(n){addDoc(collection(db,"teamleaders"),{name:n});}
  function deleteTL(id){deleteDoc(doc(db,"teamleaders",id));}
  function addTC(n){addDoc(collection(db,"tcs"),{name:n});}
  function deleteTC(id){deleteDoc(doc(db,"tcs",id));}

  var dayJobs=jobs.filter(function(j){return j.day===activeDay;});
  function countActive(day){return jobs.filter(function(j){return j.day===day&&j.status!=="Cancelled";}).length;}

  var currentSection = DRIVE_SECTIONS.find(function(s){return s.id===tab;});
  var topSidebarItems = [
    { id:"bookings", icon:"📅", label:"JOBS" },
    { id:"team",     icon:"👷", label:"TEAM" },
  ];

  return (
    <div style={{ display:"flex", minHeight:"100vh", fontFamily:"Inter,sans-serif", background:"#f0fdf4" }}>
      {/* Sidebar */}
      <div style={{ width:"68px", background:"linear-gradient(180deg,#166534,#14532d)", display:"flex", flexDirection:"column", alignItems:"center", padding:"12px 0", position:"fixed", top:0, left:0, bottom:0, zIndex:20, boxShadow:"2px 0 8px rgba(0,0,0,0.15)" }}>
        <div style={{ color:"#fff", fontFamily:"monospace", fontSize:"9px", fontWeight:"700", letterSpacing:"2px", marginBottom:"16px", textAlign:"center" }}>PTM</div>

        {/* Main nav */}
        {topSidebarItems.map(function(item){
          return (
            <button key={item.id} onClick={function(){setTab(item.id);}} title={item.label} style={{ width:"48px", height:"48px", borderRadius:"12px", border:"none", background:tab===item.id?"rgba(255,255,255,0.25)":"transparent", cursor:"pointer", marginBottom:"6px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:"20px" }}>{item.icon}</span>
              <span style={{ color:"#bbf7d0", fontSize:"8px", marginTop:"2px", fontWeight:"700" }}>{item.label}</span>
            </button>
          );
        })}

        {/* Divider */}
        <div style={{ width:"36px", height:"1px", background:"rgba(255,255,255,0.2)", margin:"8px 0" }}></div>

        {/* Drive sections */}
        {DRIVE_SECTIONS.map(function(item){
          return (
            <button key={item.id} onClick={function(){setTab(item.id);}} title={item.title} style={{ width:"48px", height:"48px", borderRadius:"12px", border:"none", background:tab===item.id?"rgba(255,255,255,0.25)":"transparent", cursor:"pointer", marginBottom:"4px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:"18px" }}>{item.icon}</span>
              <span style={{ color:"#bbf7d0", fontSize:"7px", marginTop:"2px", fontWeight:"700" }}>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main */}
      <div style={{ marginLeft:"68px", flex:1, display:"flex", flexDirection:"column" }}>
        {/* Topbar */}
        <div style={{ background:"#fff", borderBottom:"1px solid #e2e8f0", padding:"10px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, zIndex:10, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
            <h1 style={{ margin:0, color:"#166534", fontSize:"16px", fontFamily:"monospace", fontWeight:"700" }}>
              {tab==="team" ? "Team Management" : currentSection ? currentSection.title : "Bookings"}
            </h1>
            {tab==="bookings"&&viewMode==="month"?(
              <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                <button onClick={prevMonth} style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", color:"#166534", borderRadius:"6px", padding:"4px 10px", fontSize:"16px", cursor:"pointer", fontWeight:"700" }}>‹</button>
                <span style={{ color:"#374151", fontSize:"14px", fontWeight:"600", minWidth:"150px", textAlign:"center" }}>{MONTHS[calMonth]} {calYear}</span>
                <button onClick={nextMonth} style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", color:"#166534", borderRadius:"6px", padding:"4px 10px", fontSize:"16px", cursor:"pointer", fontWeight:"700" }}>›</button>
                <button onClick={function(){setCalYear(now.getFullYear());setCalMonth(now.getMonth());}} style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", color:"#166534", borderRadius:"6px", padding:"4px 10px", fontSize:"12px", cursor:"pointer" }}>Today</button>
              </div>
            ):null}
          </div>
          <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
            {tab==="bookings"?(
              <div style={{ display:"flex", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:"8px", overflow:"hidden" }}>
                {["month","week","list"].map(function(v){
                  var labels={month:"Month",week:"Week",list:"List"};
                  return <button key={v} onClick={function(){setViewMode(v);}} style={{ background:viewMode===v?"#166534":"transparent", border:"none", color:viewMode===v?"#fff":"#166534", padding:"7px 14px", fontSize:"12px", fontWeight:"600", cursor:"pointer" }}>{labels[v]}</button>;
                })}
              </div>
            ):null}
            {tab==="bookings"?(
              <button onClick={function(){openNew(null,null);}} style={{ background:"linear-gradient(135deg,#166534,#14532d)", border:"none", color:"#fff", borderRadius:"8px", padding:"8px 16px", fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>+ New Job</button>
            ):null}
          </div>
        </div>

        {/* Content */}
        {currentSection ? (
          <DriveSection section={currentSection} />
        ) : tab==="team" ? (
          <TeamPage tls={tlDocs} tcs={tcDocs} onAddTL={addTL} onDeleteTL={deleteTL} onAddTC={addTC} onDeleteTC={deleteTC} />
        ) : loading ? (
          <div style={{ textAlign:"center", padding:"80px", color:"#94a3b8" }}>Loading...</div>
        ) : viewMode==="month" ? (
          <MonthView jobs={jobs} year={calYear} month={calMonth} onEdit={function(job){setEditing(job);}} onAdd={openNew} />
        ) : viewMode==="week" ? (
          <WeekView jobs={jobs} onEdit={function(job){setEditing(job);}} onAdd={openNew} />
        ) : (
          <div>
            <div style={{ display:"flex", overflowX:"auto", background:"#fff", borderBottom:"1px solid #e2e8f0", padding:"0 8px" }}>
              {DAYS.map(function(day){
                var count=countActive(day); var active=day===activeDay;
                return <button key={day} onClick={function(){setActiveDay(day);}} style={{ background:"none", border:"none", borderBottom:active?"3px solid #166534":"3px solid transparent", color:active?"#166534":"#94a3b8", padding:"10px 14px", fontSize:"12px", fontWeight:active?"700":"500", cursor:"pointer", whiteSpace:"nowrap", fontFamily:"monospace", marginBottom:"-2px" }}>{day.slice(0,3).toUpperCase()}{count>0?<span style={{ background:active?"#166534":"#e2e8f0", color:active?"#fff":"#64748b", borderRadius:"10px", fontSize:"10px", fontWeight:"700", padding:"1px 5px", marginLeft:"5px" }}>{count}</span>:null}</button>;
              })}
            </div>
            <div style={{ padding:"14px", maxWidth:"700px", margin:"0 auto" }}>
              {dayJobs.length===0?(
                <div style={{ textAlign:"center", padding:"60px 20px", color:"#94a3b8" }}>
                  <div style={{ fontSize:"36px", marginBottom:"10px" }}>📋</div>
                  <div style={{ fontSize:"13px", marginBottom:"16px" }}>No jobs for {activeDay}</div>
                  <button onClick={function(){openNew(null,activeDay);}} style={{ background:"linear-gradient(135deg,#166534,#14532d)", border:"none", color:"#fff", borderRadius:"6px", padding:"10px 24px", fontSize:"13px", cursor:"pointer", fontWeight:"700" }}>+ Add Job</button>
                </div>
              ):(
                <div>
                  <div style={{ color:"#64748b", fontSize:"11px", fontFamily:"monospace", marginBottom:"10px" }}>{dayJobs.length} JOB{dayJobs.length>1?"S":""} — {activeDay.toUpperCase()}</div>
                  {dayJobs.map(function(job){return <JobCard key={job.id} job={job} onEdit={function(j){setEditing(j);}} onDelete={deleteJob} onToggle={toggle} />;}) }
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {editing?(
        <Modal job={editing} allJobs={jobs} tls={tlNames} tcs={tcNames} onSave={saveJob} onClose={function(){setEditing(null);}} />
      ):null}
    </div>
  );
}
