import { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "firebase/firestore";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const STATUSES = ["Completed","Pending","Cancelled","Rescheduled"];
const STATUS_COLORS = {
  Completed:   { bg:"#dcfce7", text:"#166534", border:"#22c55e" },
  Cancelled:   { bg:"#fee2e2", text:"#991b1b", border:"#ef4444" },
  Rescheduled: { bg:"#fef9c3", text:"#854d0e", border:"#f59e0b" },
  Pending:     { bg:"#dbeafe", text:"#1e40af", border:"#3b82f6" },
};
const TC_LIST = ["Diego","Ali","Hage","Angel","Victoria","Vivi","Hamid","Hamza","Lilian","Batoul","Mick","Christopher","Marcelo","Khalaf","Sayed","Alpha","Davi","Giovana","Maria Delaix","Momen","Emily","Saad","Bruna"];
const TL_LIST = ["Diego","Angel","Hage","Lilian","Victoria","Mick","Hamza","Hamid","Sayed","Bruna Gomes"];
const TIMES = [];
for (var h = 0; h < 24; h++) {
  for (var m = 0; m < 60; m += 30) {
    var ampm = h < 12 ? "am" : "pm";
    var hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    TIMES.push(hour + ":" + (m === 0 ? "00" : "30") + ampm);
  }
}

var emptyJob = { day:"Monday", date:"", client:"", time:"", address:"", workOrderRef:"", teamLeader:"", ute2:"", ute3:"", workers:[], uteCount:1, notes:"", status:"Pending", emailsSent:false, invoiceSent:false };

function JobForm(props) {
  var job = props.job;
  var onSave = props.onSave;
  var onClose = props.onClose;
  var init = job ? Object.assign({}, job, { workers: job.workers || [] }) : Object.assign({}, emptyJob);
  var s = useState(init);
  var form = s[0];
  var setForm = s[1];

  function set(k, v) { setForm(function(f) { return Object.assign({}, f, { [k]: v }); }); }

  function toggleW(name) {
    var w = form.workers || [];
    if (w.indexOf(name) >= 0) set("workers", w.filter(function(x) { return x !== name; }));
    else set("workers", w.concat([name]));
  }

  var inp = { width:"100%", background:"#f8fafc", border:"1px solid #cbd5e1", borderRadius:"6px", color:"#1a2e1a", padding:"8px 10px", fontSize:"13px", outline:"none", boxSizing:"border-box" };
  var lbl = { color:"#166534", fontSize:"11px", fontWeight:"700", letterSpacing:"0.8px", textTransform:"uppercase", marginBottom:"4px", display:"block" };
  var row = { marginBottom:"10px" };

  return (
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.5)", zIndex:9999, overflowY:"auto", padding:"20px 16px" }}>
      <div style={{ background:"#fff", borderRadius:"12px", padding:"20px", maxWidth:"500px", margin:"0 auto", boxShadow:"0 10px 40px rgba(0,0,0,0.2)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"16px" }}>
          <h2 style={{ color:"#166534", margin:0, fontSize:"15px" }}>{job && job.id ? "Editar Job" : "Novo Job"}</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:"22px", cursor:"pointer", color:"#94a3b8" }}>×</button>
        </div>

        <div style={row}><label style={lbl}>Cliente</label><input style={inp} value={form.client} onChange={function(e){set("client",e.target.value)}} placeholder="Ex: Kwikflo, Ventia..." /></div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"10px" }}>
          <div><label style={lbl}>Dia</label><select style={inp} value={form.day} onChange={function(e){set("day",e.target.value)}}>{DAYS.map(function(d){return <option key={d}>{d}</option>})}</select></div>
          <div><label style={lbl}>Data</label><input style={inp} type="date" value={form.date} onChange={function(e){set("date",e.target.value)}} /></div>
          <div><label style={lbl}>Horario</label><select style={inp} value={form.time} onChange={function(e){set("time",e.target.value)}}><option value="">Selecionar...</option>{TIMES.map(function(t){return <option key={t}>{t}</option>})}</select></div>
          <div><label style={lbl}>Status</label><select style={inp} value={form.status} onChange={function(e){set("status",e.target.value)}}>{STATUSES.map(function(s){return <option key={s}>{s}</option>})}</select></div>
        </div>

        <div style={row}><label style={lbl}>Endereco</label><input style={inp} value={form.address} onChange={function(e){set("address",e.target.value)}} placeholder="Ex: 2 Wilson St Chatswood" /></div>
        <div style={row}><label style={lbl}>Work Order Ref</label><input style={inp} value={form.workOrderRef} onChange={function(e){set("workOrderRef",e.target.value)}} placeholder="Ex: WOR201300821144" /></div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"10px" }}>
          <div><label style={lbl}>Team Leader</label><select style={inp} value={form.teamLeader} onChange={function(e){set("teamLeader",e.target.value)}}><option value="">Selecionar...</option>{TL_LIST.map(function(n){return <option key={n}>{n}</option>})}</select></div>
          <div><label style={lbl}>2nd Ute</label><select style={inp} value={form.ute2||""} onChange={function(e){set("ute2",e.target.value)}}><option value="">Nenhum</option>{TL_LIST.map(function(n){return <option key={n}>{n}</option>})}</select></div>
          <div><label style={lbl}>3rd Ute</label><select style={inp} value={form.ute3||""} onChange={function(e){set("ute3",e.target.value)}}><option value="">Nenhum</option>{TL_LIST.map(function(n){return <option key={n}>{n}</option>})}</select></div>
          <div><label style={lbl}>Nr Utes</label><input style={inp} type="number" min="1" value={form.uteCount} onChange={function(e){set("uteCount",Number(e.target.value))}} /></div>
        </div>

        <div style={row}>
          <label style={lbl}>TCs na equipe</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"6px", marginTop:"4px" }}>
            {TC_LIST.map(function(name) {
              var sel = (form.workers||[]).indexOf(name) >= 0;
              return <div key={name} onClick={function(){toggleW(name)}} style={{ padding:"4px 10px", borderRadius:"20px", fontSize:"12px", cursor:"pointer", background:sel?"#166534":"#f0fdf4", color:sel?"#fff":"#166534", border:"1px solid "+(sel?"#166534":"#bbf7d0"), userSelect:"none" }}>{name}</div>;
            })}
          </div>
          <div style={{ color:"#64748b", fontSize:"11px", marginTop:"6px" }}>{(form.workers||[]).length} TCs selecionados</div>
        </div>

        <div style={row}><label style={lbl}>Notas</label><textarea style={Object.assign({},inp,{minHeight:"56px",resize:"vertical"})} value={form.notes} onChange={function(e){set("notes",e.target.value)}} placeholder="Ex: $120 travel paid..." /></div>

        <div style={{ display:"flex", gap:"10px", marginTop:"16px" }}>
          <button onClick={onClose} style={{ flex:1, background:"#f1f5f9", border:"1px solid #cbd5e1", color:"#64748b", borderRadius:"6px", padding:"10px", fontSize:"13px", cursor:"pointer" }}>Cancelar</button>
          <button onClick={function(){onSave(form)}} style={{ flex:2, background:"linear-gradient(135deg,#166534,#14532d)", border:"none", color:"#fff", borderRadius:"6px", padding:"10px", fontSize:"13px", cursor:"pointer", fontWeight:"700" }}>Salvar Job</button>
        </div>
      </div>
    </div>
  );
}

function JobCard(props) {
  var job = props.job;
  var onEdit = props.onEdit;
  var onDelete = props.onDelete;
  var onToggle = props.onToggle;
  var sc = STATUS_COLORS[job.status] || STATUS_COLORS.Pending;
  var workers = Array.isArray(job.workers) ? job.workers : [];
  var utes = [job.teamLeader, job.ute2, job.ute3].filter(Boolean);
  var mapsUrl = "https://maps.google.com/?q=" + encodeURIComponent(job.address || "");

  return (
    <div style={{ background:"#fff", border:"1px solid "+sc.border+"44", borderLeft:"4px solid "+sc.border, borderRadius:"8px", padding:"14px 16px", marginBottom:"10px", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"8px", flexWrap:"wrap", gap:"6px" }}>
        <div>
          <span style={{ color:"#166534", fontFamily:"monospace", fontSize:"14px", fontWeight:"700" }}>{job.client}</span>
          <span style={{ color:"#94a3b8", fontSize:"12px", marginLeft:"10px" }}>{job.date}</span>
        </div>
        <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
          <span style={{ background:sc.bg, color:sc.text, borderRadius:"4px", fontSize:"10px", fontWeight:"700", padding:"2px 8px", textTransform:"uppercase" }}>{job.status}</span>
          <button onClick={function(){onEdit(job)}} style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", color:"#166534", borderRadius:"4px", padding:"3px 8px", fontSize:"11px", cursor:"pointer" }}>Edit</button>
          <button onClick={function(){onDelete(job.id)}} style={{ background:"#fff0f0", border:"1px solid #fecaca", color:"#ef4444", borderRadius:"4px", padding:"3px 8px", fontSize:"11px", cursor:"pointer" }}>X</button>
        </div>
      </div>
      <div style={{ fontSize:"12px", marginBottom:"6px" }}>
        <span style={{ color:"#3b82f6", fontWeight:"600" }}>{job.time}</span>
        <span style={{ color:"#cbd5e1", margin:"0 6px" }}>|</span>
        <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ color:"#166534" }}>{job.address}</a>
        {job.workOrderRef ? <span style={{ color:"#94a3b8", fontSize:"11px", marginLeft:"8px" }}>({job.workOrderRef})</span> : null}
      </div>
      {utes.length > 0 ? <div style={{ fontSize:"12px", marginBottom:"6px" }}>{utes.map(function(u,i){return <span key={i} style={{ marginRight:"10px" }}><span style={{ color:"#166534", fontWeight:"600" }}>{u}</span><span style={{ color:"#94a3b8", fontSize:"10px", marginLeft:"3px" }}>({i===0?"1st":i===1?"2nd":"3rd"} ute)</span></span>})}</div> : null}
      {workers.length > 0 ? <div style={{ display:"flex", flexWrap:"wrap", gap:"4px", marginBottom:"8px" }}>{workers.map(function(w){return <span key={w} style={{ background:"#f0fdf4", color:"#166534", borderRadius:"10px", fontSize:"11px", padding:"2px 8px", border:"1px solid #bbf7d0" }}>{w}</span>})}<span style={{ color:"#94a3b8", fontSize:"11px", alignSelf:"center", marginLeft:"4px" }}>{workers.length}TC / {job.uteCount} ute{job.uteCount>1?"s":""}</span></div> : null}
      {job.notes ? <div style={{ color:"#64748b", fontSize:"11px", fontStyle:"italic", marginBottom:"8px", borderLeft:"3px solid #bbf7d0", paddingLeft:"8px", background:"#f0fdf4", padding:"6px 8px", borderRadius:"0 4px 4px 0" }}>{job.notes}</div> : null}
      <div style={{ display:"flex", gap:"16px", marginTop:"8px", paddingTop:"8px", borderTop:"1px solid #f1f5f9" }}>
        <div onClick={function(){onToggle(job.id,"emailsSent")}} style={{ display:"flex", alignItems:"center", gap:"6px", cursor:"pointer" }}>
          <div style={{ width:"18px", height:"18px", borderRadius:"4px", background:job.emailsSent?"#22c55e":"#f1f5f9", border:"2px solid "+(job.emailsSent?"#22c55e":"#cbd5e1"), display:"flex", alignItems:"center", justifyContent:"center" }}>{job.emailsSent?<span style={{ color:"#fff", fontSize:"11px", fontWeight:"bold" }}>✓</span>:null}</div>
          <span style={{ color:job.emailsSent?"#22c55e":"#94a3b8", fontSize:"12px" }}>Emails enviados</span>
        </div>
        <div onClick={function(){onToggle(job.id,"invoiceSent")}} style={{ display:"flex", alignItems:"center", gap:"6px", cursor:"pointer" }}>
          <div style={{ width:"18px", height:"18px", borderRadius:"4px", background:job.invoiceSent?"#3b82f6":"#f1f5f9", border:"2px solid "+(job.invoiceSent?"#3b82f6":"#cbd5e1"), display:"flex", alignItems:"center", justifyContent:"center" }}>{job.invoiceSent?<span style={{ color:"#fff", fontSize:"11px", fontWeight:"bold" }}>✓</span>:null}</div>
          <span style={{ color:job.invoiceSent?"#3b82f6":"#94a3b8", fontSize:"12px" }}>Invoice enviada</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  var s1 = useState([]);
  var jobs = s1[0]; var setJobs = s1[1];
  var s2 = useState("Monday");
  var activeDay = s2[0]; var setActiveDay = s2[1];
  var s3 = useState(false);
  var modal = s3[0]; var setModal = s3[1];
  var s4 = useState(null);
  var editing = s4[0]; var setEditing = s4[1];
  var s5 = useState(true);
  var loading = s5[0]; var setLoading = s5[1];

  useEffect(function() {
    var q = query(collection(db, "jobs"), orderBy("date", "asc"));
    var unsub = onSnapshot(q, function(snap) {
      setJobs(snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); }));
      setLoading(false);
    });
    return unsub;
  }, []);

  function saveJob(form) {
    if (form.id) {
      var id = form.id;
      var data = Object.assign({}, form);
      delete data.id;
      updateDoc(doc(db, "jobs", id), data).then(function() { setModal(false); setEditing(null); });
    } else {
      addDoc(collection(db, "jobs"), form).then(function() { setModal(false); setEditing(null); });
    }
  }

  function deleteJob(id) {
    if (window.confirm("Deletar este job?")) deleteDoc(doc(db, "jobs", id));
  }

  function toggle(id, field) {
    var job = jobs.find(function(j) { return j.id === id; });
    var update = {}; update[field] = !job[field];
    updateDoc(doc(db, "jobs", id), update);
  }

  var dayJobs = jobs.filter(function(j) { return j.day === activeDay; });

  function countActive(day) {
    return jobs.filter(function(j) { return j.day === day && j.status !== "Cancelled"; }).length;
  }

  return (
    <div style={{ minHeight:"100vh", background:"#f0fdf4", fontFamily:"Inter,sans-serif", color:"#1a2e1a" }}>
      <div style={{ background:"linear-gradient(135deg,#166534,#14532d)", padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, zIndex:100, boxShadow:"0 2px 8px rgba(0,0,0,0.15)" }}>
        <div>
          <div style={{ fontFamily:"monospace", color:"#fff", fontSize:"17px", fontWeight:"700", letterSpacing:"1px" }}>PTM BOOKINGS</div>
          <div style={{ color:"#bbf7d0", fontSize:"11px" }}>Prestige Traffic Management</div>
        </div>
        <button onClick={function(){ setEditing(null); setModal(true); }} style={{ background:"#fff", border:"none", color:"#166534", borderRadius:"8px", padding:"8px 14px", fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>+ Novo Job</button>
      </div>

      <div style={{ display:"flex", overflowX:"auto", borderBottom:"2px solid #bbf7d0", background:"#fff", padding:"0 6px" }}>
        {DAYS.map(function(day) {
          var count = countActive(day);
          var active = day === activeDay;
          return (
            <button key={day} onClick={function(){setActiveDay(day)}} style={{ background:"none", border:"none", borderBottom:active?"3px solid #166534":"3px solid transparent", color:active?"#166534":"#94a3b8", padding:"10px 12px", fontSize:"11px", fontWeight:active?"700":"500", cursor:"pointer", whiteSpace:"nowrap", fontFamily:"monospace", marginBottom:"-2px" }}>
              {day.slice(0,3).toUpperCase()}
              {count > 0 ? <span style={{ background:active?"#166534":"#e2e8f0", color:active?"#fff":"#64748b", borderRadius:"10px", fontSize:"10px", fontWeight:"700", padding:"1px 5px", marginLeft:"5px" }}>{count}</span> : null}
            </button>
          );
        })}
      </div>

      <div style={{ padding:"14px", maxWidth:"700px", margin:"0 auto" }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:"60px", color:"#94a3b8" }}>Carregando...</div>
        ) : dayJobs.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 20px", color:"#94a3b8" }}>
            <div style={{ fontSize:"36px", marginBottom:"10px" }}>📋</div>
            <div style={{ fontSize:"13px" }}>Nenhum job para {activeDay}</div>
            <button onClick={function(){ setEditing(null); setModal(true); }} style={{ marginTop:"14px", background:"#166534", border:"none", color:"#fff", borderRadius:"6px", padding:"8px 18px", fontSize:"12px", cursor:"pointer" }}>+ Adicionar job</button>
          </div>
        ) : (
          <div>
            <div style={{ color:"#64748b", fontSize:"11px", fontFamily:"monospace", marginBottom:"10px" }}>{dayJobs.length} JOB{dayJobs.length>1?"S":""} - {activeDay.toUpperCase()}</div>
            {dayJobs.map(function(job) {
              return <JobCard key={job.id} job={job} onEdit={function(j){ setEditing(j); setModal(true); }} onDelete={deleteJob} onToggle={toggle} />;
            })}
          </div>
        )}
      </div>

      {modal ? <JobForm job={editing} onSave={saveJob} onClose={function(){ setModal(false); setEditing(null); }} /> : null}
    </div>
  );
}
