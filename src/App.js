import { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "firebase/firestore";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const STATUSES = ["Pending","Sent","Completed","Cancelled","Rescheduled"];
const STATUS_COLORS = {
  Pending:     { bg:"#dbeafe", text:"#1e40af", border:"#3b82f6" },
  Sent:        { bg:"#f3e8ff", text:"#6b21a8", border:"#a855f7" },
  Completed:   { bg:"#dcfce7", text:"#166534", border:"#22c55e" },
  Cancelled:   { bg:"#fee2e2", text:"#991b1b", border:"#ef4444" },
  Rescheduled: { bg:"#fef9c3", text:"#854d0e", border:"#f59e0b" },
};

const TIMES = [];
for (var h = 0; h < 24; h++) {
  for (var m = 0; m < 60; m += 30) {
    var ampm = h < 12 ? "am" : "pm";
    var hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    TIMES.push(hour + ":" + (m === 0 ? "00" : "30") + ampm);
  }
}

var emptyJob = { day:"Monday", date:"", client:"", time:"", address:"", workOrderRef:"", teamLeader:"", ute2:"", ute3:"", workers:[], uteCount:1, notes:"", status:"Pending", emailsSent:false, invoiceSent:false };

function getBusy(jobs, day, excludeId) {
  var busy = {};
  jobs.forEach(function(j) {
    if (j.day === day && j.id !== excludeId && j.status !== "Cancelled") {
      if (j.teamLeader) busy[j.teamLeader] = true;
      if (j.ute2) busy[j.ute2] = true;
      if (j.ute3) busy[j.ute3] = true;
      (j.workers || []).forEach(function(w) { busy[w] = true; });
    }
  });
  return busy;
}

function JobForm(props) {
  var job = props.job;
  var onSave = props.onSave;
  var onClose = props.onClose;
  var allJobs = props.allJobs || [];
  var tls = props.tls || [];
  var tcs = props.tcs || [];
  var init = job ? Object.assign({}, job, { workers: job.workers || [] }) : Object.assign({}, emptyJob);
  var s = useState(init); var form = s[0]; var setForm = s[1];
  var busy = getBusy(allJobs, form.day, job ? job.id : null);

  function set(k, v) { setForm(function(f) { return Object.assign({}, f, { [k]: v }); }); }
  function toggleW(name) {
    var w = form.workers || [];
    if (w.indexOf(name) >= 0) set("workers", w.filter(function(x) { return x !== name; }));
    else set("workers", w.concat([name]));
  }

  var inp = { width:"100%", background:"#f8fafc", border:"1px solid #cbd5e1", borderRadius:"6px", color:"#1a2e1a", padding:"8px 10px", fontSize:"13px", outline:"none", boxSizing:"border-box" };
  var lbl = { color:"#166534", fontSize:"11px", fontWeight:"700", letterSpacing:"0.8px", textTransform:"uppercase", marginBottom:"4px", display:"block" };

  return (
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.5)", zIndex:9999, overflowY:"auto", padding:"20px 16px" }}>
      <div style={{ background:"#fff", borderRadius:"12px", padding:"20px", maxWidth:"500px", margin:"0 auto", boxShadow:"0 10px 40px rgba(0,0,0,0.2)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"16px" }}>
          <h2 style={{ color:"#166534", margin:0, fontSize:"15px" }}>{job && job.id ? "Edit Job" : "New Job"}</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:"22px", cursor:"pointer", color:"#94a3b8" }}>×</button>
        </div>

        <div style={{ marginBottom:"10px" }}><label style={lbl}>Client</label><input style={inp} value={form.client} onChange={function(e){set("client",e.target.value)}} placeholder="Ex: Kwikflo, Ventia..." /></div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"10px" }}>
          <div><label style={lbl}>Day</label><select style={inp} value={form.day} onChange={function(e){set("day",e.target.value)}}>{DAYS.map(function(d){return <option key={d}>{d}</option>})}</select></div>
          <div><label style={lbl}>Date</label><input style={inp} type="date" value={form.date} onChange={function(e){set("date",e.target.value)}} /></div>
          <div><label style={lbl}>Time on site</label><select style={inp} value={form.time} onChange={function(e){set("time",e.target.value)}}><option value="">Select...</option>{TIMES.map(function(t){return <option key={t}>{t}</option>})}</select></div>
          <div><label style={lbl}>Status</label><select style={inp} value={form.status} onChange={function(e){set("status",e.target.value)}}>{STATUSES.map(function(s){return <option key={s}>{s}</option>})}</select></div>
        </div>

        <div style={{ marginBottom:"10px" }}><label style={lbl}>Address</label><input style={inp} value={form.address} onChange={function(e){set("address",e.target.value)}} placeholder="Ex: 2 Wilson St Chatswood" /></div>
        <div style={{ marginBottom:"10px" }}><label style={lbl}>Work Order Ref</label><input style={inp} value={form.workOrderRef} onChange={function(e){set("workOrderRef",e.target.value)}} placeholder="Ex: WOR201300821144" /></div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"10px" }}>
          <div>
            <label style={lbl}>Team Leader (1st Ute)</label>
            <select style={inp} value={form.teamLeader} onChange={function(e){set("teamLeader",e.target.value)}}>
              <option value="">Select...</option>
              {tls.map(function(n){ return <option key={n} disabled={!!busy[n] && form.teamLeader !== n}>{busy[n] && form.teamLeader !== n ? n+" (busy)" : n}</option>; })}
            </select>
          </div>
          <div>
            <label style={lbl}>2nd Ute</label>
            <select style={inp} value={form.ute2||""} onChange={function(e){set("ute2",e.target.value)}}>
              <option value="">None</option>
              {tls.map(function(n){ return <option key={n} disabled={!!busy[n] && form.ute2 !== n}>{busy[n] && form.ute2 !== n ? n+" (busy)" : n}</option>; })}
            </select>
          </div>
          <div>
            <label style={lbl}>3rd Ute</label>
            <select style={inp} value={form.ute3||""} onChange={function(e){set("ute3",e.target.value)}}>
              <option value="">None</option>
              {tls.map(function(n){ return <option key={n} disabled={!!busy[n] && form.ute3 !== n}>{busy[n] && form.ute3 !== n ? n+" (busy)" : n}</option>; })}
            </select>
          </div>
          <div><label style={lbl}>Nr Utes</label><input style={inp} type="number" min="1" value={form.uteCount} onChange={function(e){set("uteCount",Number(e.target.value))}} /></div>
        </div>

        <div style={{ marginBottom:"10px" }}>
          <label style={lbl}>TCs on crew</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"6px", marginTop:"4px" }}>
            {tcs.map(function(name) {
              var sel = (form.workers||[]).indexOf(name) >= 0;
              var isBusy = !!busy[name] && !sel;
              return <div key={name} onClick={function(){ if(!isBusy) toggleW(name); }} style={{ padding:"4px 10px", borderRadius:"20px", fontSize:"12px", cursor:isBusy?"not-allowed":"pointer", background:sel?"#166534":isBusy?"#f1f5f9":"#f0fdf4", color:sel?"#fff":isBusy?"#cbd5e1":"#166534", border:"1px solid "+(sel?"#166534":isBusy?"#e2e8f0":"#bbf7d0"), userSelect:"none", textDecoration:isBusy?"line-through":"none", opacity:isBusy?0.6:1 }}>{name}</div>;
            })}
          </div>
          <div style={{ color:"#64748b", fontSize:"11px", marginTop:"6px" }}>{(form.workers||[]).length} TCs selected{Object.keys(busy).length > 0 ? " • strikethrough = busy this day" : ""}</div>
        </div>

        <div style={{ marginBottom:"10px" }}><label style={lbl}>Notes</label><textarea style={Object.assign({},inp,{minHeight:"56px",resize:"vertical"})} value={form.notes} onChange={function(e){set("notes",e.target.value)}} placeholder="Ex: $120 travel paid..." /></div>

        <div style={{ display:"flex", gap:"10px", marginTop:"16px" }}>
          <button onClick={onClose} style={{ flex:1, background:"#f1f5f9", border:"1px solid #cbd5e1", color:"#64748b", borderRadius:"6px", padding:"10px", fontSize:"13px", cursor:"pointer" }}>Cancel</button>
          <button onClick={function(){onSave(form)}} style={{ flex:2, background:"linear-gradient(135deg,#166534,#14532d)", border:"none", color:"#fff", borderRadius:"6px", padding:"10px", fontSize:"13px", cursor:"pointer", fontWeight:"700" }}>Save Job</button>
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
        <div>
          <span style={{ color:"#166534", fontFamily:"monospace", fontSize:"14px", fontWeight:"700" }}>{job.client}</span>
          <span style={{ color:"#94a3b8", fontSize:"12px", marginLeft:"10px" }}>{job.date}</span>
        </div>
        <div style={{ display:"flex", gap:"6px", alignItems:"center", flexWrap:"wrap" }}>
          <span style={{ background:sc.bg, color:sc.text, borderRadius:"4px", fontSize:"10px", fontWeight:"700", padding:"2px 8px", textTransform:"uppercase" }}>{job.status}</span>
          <button onClick={function(){props.onEdit(job)}} style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", color:"#166534", borderRadius:"4px", padding:"3px 8px", fontSize:"11px", cursor:"pointer" }}>Edit</button>
          <button onClick={function(){props.onDelete(job.id)}} style={{ background:"#fff0f0", border:"1px solid #fecaca", color:"#ef4444", borderRadius:"4px", padding:"3px 8px", fontSize:"11px", cursor:"pointer" }}>✕</button>
        </div>
      </div>
      <div style={{ fontSize:"12px", marginBottom:"6px" }}>
        <span style={{ color:"#3b82f6", fontWeight:"600" }}>{job.time}</span>
        {job.address ? <span><span style={{ color:"#cbd5e1", margin:"0 6px" }}>|</span><a href={mapsUrl} target="_blank" rel="noreferrer" style={{ color:"#166534" }}>📍 {job.address}</a></span> : null}
        {job.workOrderRef ? <span style={{ color:"#94a3b8", fontSize:"11px", marginLeft:"8px" }}>({job.workOrderRef})</span> : null}
      </div>
      {utes.length > 0 ? <div style={{ fontSize:"12px", marginBottom:"6px" }}>{utes.map(function(u,i){return <span key={i} style={{ marginRight:"10px" }}><span style={{ color:"#166534", fontWeight:"600" }}>🚐 {u}</span><span style={{ color:"#94a3b8", fontSize:"10px", marginLeft:"3px" }}>({i===0?"1st":i===1?"2nd":"3rd"} ute)</span></span>})}</div> : null}
      {workers.length > 0 ? <div style={{ display:"flex", flexWrap:"wrap", gap:"4px", marginBottom:"8px" }}>{workers.map(function(w){return <span key={w} style={{ background:"#f0fdf4", color:"#166534", borderRadius:"10px", fontSize:"11px", padding:"2px 8px", border:"1px solid #bbf7d0" }}>{w}</span>})}<span style={{ color:"#94a3b8", fontSize:"11px", alignSelf:"center", marginLeft:"4px" }}>{workers.length}TC / {job.uteCount} ute{job.uteCount>1?"s":""}</span></div> : null}
      {job.notes ? <div style={{ color:"#64748b", fontSize:"11px", fontStyle:"italic", marginBottom:"8px", borderLeft:"3px solid #bbf7d0", paddingLeft:"8px", background:"#f0fdf4", padding:"6px 8px", borderRadius:"0 4px 4px 0" }}>{job.notes}</div> : null}
      <div style={{ display:"flex", gap:"16px", marginTop:"8px", paddingTop:"8px", borderTop:"1px solid #f1f5f9" }}>
        <div onClick={function(){props.onToggle(job.id,"emailsSent")}} style={{ display:"flex", alignItems:"center", gap:"6px", cursor:"pointer" }}>
          <div style={{ width:"18px", height:"18px", borderRadius:"4px", background:job.emailsSent?"#22c55e":"#f1f5f9", border:"2px solid "+(job.emailsSent?"#22c55e":"#cbd5e1"), display:"flex", alignItems:"center", justifyContent:"center" }}>{job.emailsSent?<span style={{ color:"#fff", fontSize:"11px" }}>✓</span>:null}</div>
          <span style={{ color:job.emailsSent?"#22c55e":"#94a3b8", fontSize:"12px" }}>Emails sent</span>
        </div>
        <div onClick={function(){props.onToggle(job.id,"invoiceSent")}} style={{ display:"flex", alignItems:"center", gap:"6px", cursor:"pointer" }}>
          <div style={{ width:"18px", height:"18px", borderRadius:"4px", background:job.invoiceSent?"#3b82f6":"#f1f5f9", border:"2px solid "+(job.invoiceSent?"#3b82f6":"#cbd5e1"), display:"flex", alignItems:"center", justifyContent:"center" }}>{job.invoiceSent?<span style={{ color:"#fff", fontSize:"11px" }}>✓</span>:null}</div>
          <span style={{ color:job.invoiceSent?"#3b82f6":"#94a3b8", fontSize:"12px" }}>Invoice sent</span>
        </div>
      </div>
    </div>
  );
}

function TeamView(props) {
  var tls = props.tls; var tcs = props.tcs;
  var onAddTL = props.onAddTL; var onAddTC = props.onAddTC;
  var onDeleteTL = props.onDeleteTL; var onDeleteTC = props.onDeleteTC;
  var s1 = useState(""); var newTL = s1[0]; var setNewTL = s1[1];
  var s2 = useState(""); var newTC = s2[0]; var setNewTC = s2[1];

  var inp = { background:"#f8fafc", border:"1px solid #cbd5e1", borderRadius:"6px", color:"#1a2e1a", padding:"8px 10px", fontSize:"13px", outline:"none", flex:1 };

  return (
    <div style={{ padding:"16px", maxWidth:"700px", margin:"0 auto" }}>
      {/* Team Leaders */}
      <div style={{ background:"#fff", borderRadius:"10px", padding:"16px", marginBottom:"16px", boxShadow:"0 1px 4px rgba(0,0,0,0.06)", border:"1px solid #bbf7d0" }}>
        <h3 style={{ color:"#166534", fontFamily:"monospace", fontSize:"14px", margin:"0 0 12px 0", letterSpacing:"0.5px" }}>🚐 TEAM LEADERS</h3>
        <div style={{ display:"flex", gap:"8px", marginBottom:"12px" }}>
          <input style={inp} value={newTL} onChange={function(e){setNewTL(e.target.value)}} placeholder="Add team leader name..." onKeyDown={function(e){ if(e.key==="Enter" && newTL.trim()){ onAddTL(newTL.trim()); setNewTL(""); }}} />
          <button onClick={function(){ if(newTL.trim()){ onAddTL(newTL.trim()); setNewTL(""); }}} style={{ background:"#166534", border:"none", color:"#fff", borderRadius:"6px", padding:"8px 14px", fontSize:"13px", cursor:"pointer", fontWeight:"700" }}>Add</button>
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:"8px" }}>
          {tls.map(function(tl) {
            return (
              <div key={tl.id} style={{ display:"flex", alignItems:"center", gap:"6px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:"20px", padding:"4px 12px" }}>
                <span style={{ color:"#166534", fontSize:"13px", fontWeight:"600" }}>{tl.name}</span>
                <span onClick={function(){onDeleteTL(tl.id)}} style={{ color:"#ef4444", cursor:"pointer", fontSize:"14px", fontWeight:"bold" }}>×</span>
              </div>
            );
          })}
          {tls.length === 0 ? <span style={{ color:"#94a3b8", fontSize:"13px" }}>No team leaders yet</span> : null}
        </div>
      </div>

      {/* Traffic Controllers */}
      <div style={{ background:"#fff", borderRadius:"10px", padding:"16px", boxShadow:"0 1px 4px rgba(0,0,0,0.06)", border:"1px solid #bbf7d0" }}>
        <h3 style={{ color:"#166534", fontFamily:"monospace", fontSize:"14px", margin:"0 0 12px 0", letterSpacing:"0.5px" }}>👷 TRAFFIC CONTROLLERS</h3>
        <div style={{ display:"flex", gap:"8px", marginBottom:"12px" }}>
          <input style={inp} value={newTC} onChange={function(e){setNewTC(e.target.value)}} placeholder="Add TC name..." onKeyDown={function(e){ if(e.key==="Enter" && newTC.trim()){ onAddTC(newTC.trim()); setNewTC(""); }}} />
          <button onClick={function(){ if(newTC.trim()){ onAddTC(newTC.trim()); setNewTC(""); }}} style={{ background:"#166534", border:"none", color:"#fff", borderRadius:"6px", padding:"8px 14px", fontSize:"13px", cursor:"pointer", fontWeight:"700" }}>Add</button>
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:"8px" }}>
          {tcs.map(function(tc) {
            return (
              <div key={tc.id} style={{ display:"flex", alignItems:"center", gap:"6px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:"20px", padding:"4px 12px" }}>
                <span style={{ color:"#166534", fontSize:"13px" }}>{tc.name}</span>
                <span onClick={function(){onDeleteTC(tc.id)}} style={{ color:"#ef4444", cursor:"pointer", fontSize:"14px", fontWeight:"bold" }}>×</span>
              </div>
            );
          })}
          {tcs.length === 0 ? <span style={{ color:"#94a3b8", fontSize:"13px" }}>No TCs yet</span> : null}
        </div>
      </div>
    </div>
  );
}

function CalendarView(props) {
  var jobs = props.jobs; var onEdit = props.onEdit; var onAdd = props.onAdd;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:"6px", padding:"12px" }}>
      {DAYS.map(function(day) {
        var dayJobs = jobs.filter(function(j){ return j.day === day; });
        var activeCount = dayJobs.filter(function(j){ return j.status !== "Cancelled"; }).length;
        return (
          <div key={day} style={{ background:"#fff", borderRadius:"8px", border:"1px solid #bbf7d0", minHeight:"120px", overflow:"hidden" }}>
            <div style={{ background:"#166534", padding:"6px 8px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ color:"#fff", fontSize:"11px", fontWeight:"700", fontFamily:"monospace" }}>{day.slice(0,3).toUpperCase()}</span>
              {activeCount > 0 ? <span style={{ background:"#fff", color:"#166534", borderRadius:"10px", fontSize:"10px", fontWeight:"700", padding:"1px 5px" }}>{activeCount}</span> : null}
            </div>
            <div style={{ padding:"4px" }}>
              {dayJobs.map(function(job) {
                var sc = STATUS_COLORS[job.status] || STATUS_COLORS.Pending;
                return (
                  <div key={job.id} onClick={function(){onEdit(job)}} style={{ background:sc.bg, borderLeft:"3px solid "+sc.border, borderRadius:"3px", padding:"3px 5px", marginBottom:"3px", cursor:"pointer", fontSize:"10px" }}>
                    <div style={{ color:sc.text, fontWeight:"700", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job.client}</div>
                    <div style={{ color:"#64748b", fontSize:"9px" }}>{job.time}</div>
                  </div>
                );
              })}
              <div onClick={function(){onAdd(day)}} style={{ color:"#166534", fontSize:"18px", textAlign:"center", cursor:"pointer", marginTop:"4px", opacity:0.4 }}>+</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  var s1 = useState([]); var jobs = s1[0]; var setJobs = s1[1];
  var s2 = useState([]); var tlDocs = s2[0]; var setTlDocs = s2[1];
  var s3 = useState([]); var tcDocs = s3[0]; var setTcDocs = s3[1];
  var s4 = useState("Monday"); var activeDay = s4[0]; var setActiveDay = s4[1];
  var s5 = useState(false); var modal = s5[0]; var setModal = s5[1];
  var s6 = useState(null); var editing = s6[0]; var setEditing = s6[1];
  var s7 = useState(true); var loading = s7[0]; var setLoading = s7[1];
  var s8 = useState("bookings"); var tab = s8[0]; var setTab = s8[1];
  var s9 = useState("list"); var view = s9[0]; var setView = s9[1];

  useEffect(function() {
    var q = query(collection(db, "jobs"), orderBy("date", "asc"));
    var unsub = onSnapshot(q, function(snap) {
      setJobs(snap.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); }));
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(function() {
    var unsub1 = onSnapshot(collection(db, "teamleaders"), function(snap) {
      setTlDocs(snap.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); }));
    });
    var unsub2 = onSnapshot(collection(db, "tcs"), function(snap) {
      setTcDocs(snap.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); }));
    });
    return function(){ unsub1(); unsub2(); };
  }, []);

  var tlNames = tlDocs.map(function(t){ return t.name; });
  var tcNames = tcDocs.map(function(t){ return t.name; });

  function saveJob(form) {
    if (form.id) {
      var id = form.id; var data = Object.assign({}, form); delete data.id;
      updateDoc(doc(db, "jobs", id), data).then(function(){ setModal(false); setEditing(null); });
    } else {
      addDoc(collection(db, "jobs"), form).then(function(){ setModal(false); setEditing(null); });
    }
  }

  function deleteJob(id) {
    if (window.confirm("Delete this job?")) deleteDoc(doc(db, "jobs", id));
  }

  function toggle(id, field) {
    var job = jobs.find(function(j){ return j.id === id; });
    var u = {}; u[field] = !job[field];
    updateDoc(doc(db, "jobs", id), u);
  }

  function openNew(day) {
    var j = Object.assign({}, emptyJob);
    if (day) j.day = day;
    setEditing(j);
    setModal(true);
  }

  function addTL(name) { addDoc(collection(db, "teamleaders"), { name: name }); }
  function deleteTL(id) { deleteDoc(doc(db, "teamleaders", id)); }
  function addTC(name) { addDoc(collection(db, "tcs"), { name: name }); }
  function deleteTC(id) { deleteDoc(doc(db, "tcs", id)); }

  var dayJobs = jobs.filter(function(j){ return j.day === activeDay; });
  function countActive(day){ return jobs.filter(function(j){ return j.day === day && j.status !== "Cancelled"; }).length; }

  return (
    <div style={{ minHeight:"100vh", background:"#f0fdf4", fontFamily:"Inter,sans-serif", color:"#1a2e1a" }}>
      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#166534,#14532d)", padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, zIndex:100, boxShadow:"0 2px 8px rgba(0,0,0,0.15)" }}>
        <div>
          <div style={{ fontFamily:"monospace", color:"#fff", fontSize:"17px", fontWeight:"700", letterSpacing:"1px" }}>PTM BOOKINGS</div>
          <div style={{ color:"#bbf7d0", fontSize:"11px" }}>Prestige Traffic Management</div>
        </div>
        <div style={{ display:"flex", gap:"8px" }}>
          {tab === "bookings" ? (
            <button onClick={function(){ setView(view === "list" ? "calendar" : "list"); }} style={{ background:"rgba(255,255,255,0.2)", border:"1px solid rgba(255,255,255,0.3)", color:"#fff", borderRadius:"6px", padding:"6px 12px", fontSize:"12px", cursor:"pointer" }}>
              {view === "list" ? "📅 Calendar" : "📋 List"}
            </button>
          ) : null}
          {tab === "bookings" ? (
            <button onClick={function(){ setEditing(null); setModal(true); }} style={{ background:"#fff", border:"none", color:"#166534", borderRadius:"8px", padding:"8px 14px", fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>+ New Job</button>
          ) : null}
        </div>
      </div>

      {/* Nav tabs */}
      <div style={{ display:"flex", background:"#fff", borderBottom:"2px solid #bbf7d0" }}>
        <button onClick={function(){setTab("bookings")}} style={{ flex:1, background:"none", border:"none", borderBottom:tab==="bookings"?"3px solid #166534":"3px solid transparent", color:tab==="bookings"?"#166534":"#94a3b8", padding:"12px", fontSize:"13px", fontWeight:tab==="bookings"?"700":"500", cursor:"pointer", marginBottom:"-2px" }}>📋 Bookings</button>
        <button onClick={function(){setTab("team")}} style={{ flex:1, background:"none", border:"none", borderBottom:tab==="team"?"3px solid #166534":"3px solid transparent", color:tab==="team"?"#166534":"#94a3b8", padding:"12px", fontSize:"13px", fontWeight:tab==="team"?"700":"500", cursor:"pointer", marginBottom:"-2px" }}>👷 Team</button>
      </div>

      {tab === "team" ? (
        <TeamView tls={tlDocs} tcs={tcDocs} onAddTL={addTL} onAddTC={addTC} onDeleteTL={deleteTL} onDeleteTC={deleteTC} />
      ) : tab === "bookings" && view === "calendar" ? (
        <CalendarView jobs={jobs} onEdit={function(j){ setEditing(j); setModal(true); }} onAdd={function(day){ openNew(day); }} />
      ) : (
        <div>
          <div style={{ display:"flex", overflowX:"auto", borderBottom:"1px solid #e2e8f0", background:"#fff", padding:"0 6px" }}>
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
              <div style={{ textAlign:"center", padding:"60px", color:"#94a3b8" }}>Loading...</div>
            ) : dayJobs.length === 0 ? (
              <div style={{ textAlign:"center", padding:"60px 20px", color:"#94a3b8" }}>
                <div style={{ fontSize:"36px", marginBottom:"10px" }}>📋</div>
                <div style={{ fontSize:"13px" }}>No jobs for {activeDay}</div>
                <button onClick={function(){ openNew(activeDay); }} style={{ marginTop:"14px", background:"#166534", border:"none", color:"#fff", borderRadius:"6px", padding:"8px 18px", fontSize:"12px", cursor:"pointer" }}>+ Add job</button>
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
        </div>
      )}

      {modal ? <JobForm job={editing} onSave={saveJob} onClose={function(){ setModal(false); setEditing(null); }} allJobs={jobs} tls={tlNames} tcs={tcNames} /> : null}
    </div>
  );
}
