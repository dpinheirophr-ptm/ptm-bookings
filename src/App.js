import { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy
} from "firebase/firestore";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const STATUSES = ["Completed","Cancelled","Rescheduled","Pending"];
const STATUS_COLORS = {
  Completed:   { bg:"#dcfce7", text:"#166534", border:"#22c55e" },
  Cancelled:   { bg:"#fee2e2", text:"#991b1b", border:"#ef4444" },
  Rescheduled: { bg:"#fef9c3", text:"#854d0e", border:"#f59e0b" },
  Pending:     { bg:"#dbeafe", text:"#1e40af", border:"#3b82f6" },
};

const TC_LIST = [
  "Diego","Ali","Hage","Angel","Victoria","Vivi","Hamid","Hamza",
  "Lilian","Batoul","Mick","Christopher","Marcelo","Khalaf","Sayed",
  "Alpha","Davi","Giovana","Maria Delaix","Momen","Emily","Saad","Bruna"
];

const TL_LIST = [
  "Diego","Angel","Hage","Lilian","Victoria","Mick","Hamza","Hamid","Sayed","Bruna Gomes"
];

const TIMES = [];
for (let h = 0; h < 24; h++) {
  for (let m of [0, 30]) {
    const ampm = h < 12 ? "am" : "pm";
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    TIMES.push(`${hour}:${m === 0 ? "00" : "30"}${ampm}`);
  }
}

const emptyJob = {
  day:"Monday", date:"", client:"", time:"", address:"",
  workOrderRef:"", teamLeader:"", ute2:"", ute3:"", workers:[],
  tcCount:1, uteCount:1, notes:"", status:"Pending",
  emailsSent:false, invoiceSent:false
};

function getBusyPeople(jobs, currentDay, currentId) {
  const busy = new Set();
  jobs.forEach(j => {
    if (j.day === currentDay && j.id !== currentId && j.status !== "Cancelled") {
      if (j.teamLeader) busy.add(j.teamLeader);
      if (j.ute2) busy.add(j.ute2);
      if (j.ute3) busy.add(j.ute3);
      (j.workers || []).forEach(w => busy.add(w));
    }
  });
  return busy;
}

function Modal({ job, onSave, onClose, allJobs }) {
  const [form, setForm] = useState(job ? { ...job, workers: job.workers || [] } : { ...emptyJob });
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));
  const busy = getBusyPeople(allJobs, form.day, job?.id);

  const toggleWorker = (name) => {
    const w = form.workers || [];
    if (w.includes(name)) set("workers", w.filter(x => x !== name));
    else set("workers", [...w, name]);
  };

  const inp = {
    width:"100%", background:"#f8fafc", border:"1px solid #cbd5e1",
    borderRadius:"6px", color:"#1a2e1a", padding:"8px 10px",
    fontSize:"13px", outline:"none", boxSizing:"border-box"
  };
  const lbl = {
    color:"#166534", fontSize:"11px", fontWeight:"700",
    letterSpacing:"0.8px", textTransform:"uppercase",
    marginBottom:"4px", display:"block"
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#00000066", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:"16px" }}>
      <div style={{ background:"#ffffff", border:"1px solid #bbf7d0",
        borderRadius:"12px", padding:"20px", width:"100%", maxWidth:"500px", maxHeight:"90vh", overflowY:"auto",
        boxShadow:"0 20px 60px rgba(0,0,0,0.15)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"16px" }}>
          <h2 style={{ color:"#166534", fontFamily:"monospace", fontSize:"15px", margin:0 }}>
            {job?.id ? "✏️ Editar Job" : "➕ Novo Job"}
          </h2>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#94a3b8", fontSize:"20px", cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>Cliente</label>
            <input style={inp} value={form.client} onChange={e=>set("client",e.target.value)} placeholder="Ex: Kwikflo, Ventia..." />
          </div>
          <div>
            <label style={lbl}>Dia</label>
            <select style={inp} value={form.day} onChange={e=>set("day",e.target.value)}>
              {DAYS.map(d=><option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Data</label>
            <input style={inp} type="date" value={form.date} onChange={e=>set("date",e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Horário on site</label>
            <select style={inp} value={form.time} onChange={e=>set("time",e.target.value)}>
              <option value="">Selecionar...</option>
              {TIMES.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Status</label>
            <select style={inp} value={form.status} onChange={e=>set("status",e.target.value)}>
              {STATUSES.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>Endereço</label>
            <input style={inp} value={form.address} onChange={e=>set("address",e.target.value)} placeholder="Ex: 2 Wilson St Chatswood" />
          </div>
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>Work Order Ref (opcional)</label>
            <input style={inp} value={form.workOrderRef} onChange={e=>set("workOrderRef",e.target.value)} placeholder="Ex: WOR201300821144" />
          </div>

          {/* Team Leader */}
          <div>
            <label style={lbl}>Team Leader (1st Ute)</label>
            <select style={inp} value={form.teamLeader} onChange={e=>set("teamLeader",e.target.value)}>
              <option value="">Selecionar...</option>
              {TL_LIST.map(n => (
                <option key={n} value={n} disabled={busy.has(n)}>
                  {busy.has(n) ? `${n} — ocupado` : n}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={lbl}>2nd Ute</label>
            <select style={inp} value={form.ute2||""} onChange={e=>set("ute2",e.target.value)}>
              <option value="">Nenhum</option>
              {TL_LIST.map(n => (
                <option key={n} value={n} disabled={busy.has(n)}>
                  {busy.has(n) ? `${n} — ocupado` : n}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={lbl}>3rd Ute</label>
            <select style={inp} value={form.ute3||""} onChange={e=>set("ute3",e.target.value)}>
              <option value="">Nenhum</option>
              {TL_LIST.map(n => (
                <option key={n} value={n} disabled={busy.has(n)}>
                  {busy.has(n) ? `${n} — ocupado` : n}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={lbl}>Nº Utes</label>
            <input style={inp} type="number" min="1" value={form.uteCount} onChange={e=>set("uteCount",Number(e.target.value))} />
          </div>

          {/* TCs */}
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>TCs na equipe</label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:"6px", marginTop:"4px" }}>
              {TC_LIST.map(name => {
                const selected = (form.workers||[]).includes(name);
                const isBusy = busy.has(name) && !selected;
                return (
                  <div key={name} onClick={()=>!isBusy && toggleWorker(name)} style={{
                    padding:"4px 10px", borderRadius:"20px", fontSize:"12px",
                    cursor: isBusy ? "not-allowed" : "pointer", transition:"all 0.15s",
                    background: selected ? "#166534" : isBusy ? "#f1f5f9" : "#f0fdf4",
                    color: selected ? "#ffffff" : isBusy ? "#cbd5e1" : "#166534",
                    border: `1px solid ${selected ? "#166534" : isBusy ? "#e2e8f0" : "#bbf7d0"}`,
                    userSelect:"none", opacity: isBusy ? 0.5 : 1,
                    textDecoration: isBusy ? "line-through" : "none"
                  }}>{name}</div>
                );
              })}
            </div>
            <div style={{ color:"#64748b", fontSize:"11px", marginTop:"6px" }}>
              {(form.workers||[]).length} TC{(form.workers||[]).length !== 1 ? "s" : ""} selecionado{(form.workers||[]).length !== 1 ? "s" : ""}
              {busy.size > 0 && <span style={{ color:"#ef4444", marginLeft:"8px" }}>• riscados = ocupados no dia</span>}
            </div>
          </div>

          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>Notas</label>
            <textarea style={{ ...inp, minHeight:"56px", resize:"vertical" }}
              value={form.notes} onChange={e=>set("notes",e.target.value)}
              placeholder="Ex: $120 travel paid, reagendado para segunda..." />
          </div>
        </div>

        <div style={{ display:"flex", gap:"10px", marginTop:"16px" }}>
          <button onClick={onClose} style={{ flex:1, background:"#f1f5f9", border:"1px solid #cbd5e1",
            color:"#64748b", borderRadius:"6px", padding:"10px", fontSize:"13px", cursor:"pointer" }}>
            Cancelar
          </button>
          <button onClick={()=>onSave(form)} style={{ flex:2,
            background:"linear-gradient(135deg,#166534,#14532d)",
            border:"none", color:"#ffffff",
            borderRadius:"6px", padding:"10px", fontSize:"13px",
            cursor:"pointer", fontWeight:"700" }}>
            💾 Salvar Job
          </button>
        </div>
      </div>
    </div>
  );
}

function JobCard({ job, onEdit, onDelete, onToggle }) {
  const sc = STATUS_COLORS[job.status] || STATUS_COLORS.Pending;
  const workers = Array.isArray(job.workers) ? job.workers : (job.workers ? [job.workers] : []);
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(job.address)}`;

  const Checkbox = ({ field, label, color }) => (
    <div onClick={()=>onToggle(job.id, field)} style={{ display:"flex", alignItems:"center", gap:"6px", cursor:"pointer" }}>
      <div style={{ width:"18px", height:"18px", borderRadius:"4px", transition:"all 0.2s",
        background: job[field] ? color : "#f1f5f9",
        border: `2px solid ${job[field] ? color : "#cbd5e1"}`,
        display:"flex", alignItems:"center", justifyContent:"center" }}>
        {job[field] && <span style={{ color:"#fff", fontSize:"12px", fontWeight:"bold" }}>✓</span>}
      </div>
      <span style={{ color: job[field] ? color : "#94a3b8", fontSize:"12px", fontWeight:"500" }}>{label}</span>
    </div>
  );

  const utes = [job.teamLeader, job.ute2, job.ute3].filter(Boolean);

  return (
    <div style={{ background:"#ffffff", border:`1px solid ${sc.border}44`,
      borderLeft:`4px solid ${sc.border}`, borderRadius:"8px",
      padding:"14px 16px", marginBottom:"10px",
      boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"8px" }}>
        <div>
          <span style={{ color:"#166534", fontFamily:"monospace", fontSize:"14px", fontWeight:"700" }}>{job.client}</span>
          <span style={{ color:"#94a3b8", fontSize:"12px", marginLeft:"10px" }}>{job.date}</span>
        </div>
        <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
          <span style={{ background:sc.bg, color:sc.text, border:`1px solid ${sc.border}55`,
            borderRadius:"4px", fontSize:"10px", fontWeight:"700", padding:"2px 8px",
            textTransform:"uppercase", letterSpacing:"0.8px" }}>{job.status}</span>
          <button onClick={()=>onEdit(job)} style={{ background:"#f0fdf4", border:"1px solid #bbf7d0",
            color:"#166534", borderRadius:"4px", padding:"3px 8px", fontSize:"11px", cursor:"pointer" }}>Edit</button>
          <button onClick={()=>onDelete(job.id)} style={{ background:"#fff0f0", border:"1px solid #fecaca",
            color:"#ef4444", borderRadius:"4px", padding:"3px 8px", fontSize:"11px", cursor:"pointer" }}>✕</button>
        </div>
      </div>

      <div style={{ fontSize:"12px", marginBottom:"6px", display:"flex", alignItems:"center", gap:"6px", flexWrap:"wrap" }}>
        <span style={{ color:"#3b82f6", fontWeight:"600" }}>⏰ {job.time}</span>
        <span style={{ color:"#cbd5e1" }}>•</span>
        <a href={mapsUrl} target="_blank" rel="noreferrer" style={{
          color:"#166534", textDecoration:"underline", fontSize:"12px" }}>
          📍 {job.address}
        </a>
        {job.workOrderRef && <span style={{ color:"#94a3b8", fontSize:"11px" }}>({job.workOrderRef})</span>}
      </div>

      <div style={{ fontSize:"12px", marginBottom:"6px" }}>
        {utes.map((u,i) => (
          <span key={i} style={{ marginRight:"10px" }}>
            <span style={{ color:"#166534", fontWeight:"600" }}>🚐 {u}</span>
            <span style={{ color:"#94a3b8", fontSize:"10px", marginLeft:"3px" }}>({i===0?"1st":i===1?"2nd":"3rd"} ute)</span>
          </span>
        ))}
      </div>

      {workers.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:"4px", marginBottom:"8px" }}>
          {workers.map(w => (
            <span key={w} style={{ background:"#f0fdf4", color:"#166534", borderRadius:"10px",
              fontSize:"11px", padding:"2px 8px", border:"1px solid #bbf7d0" }}>{w}</span>
          ))}
          <span style={{ color:"#94a3b8", fontSize:"11px", alignSelf:"center", marginLeft:"4px" }}>
            · {workers.length}TC / {job.uteCount} ute{job.uteCount>1?"s":""}
          </span>
        </div>
      )}

      {job.notes && (
        <div style={{ color:"#64748b", fontSize:"11px", fontStyle:"italic",
          marginBottom:"8px", borderLeft:"3px solid #bbf7d0", paddingLeft:"8px", background:"#f0fdf4",
          padding:"6px 8px", borderRadius:"0 4px 4px 0" }}>
          {job.notes}
        </div>
      )}

      <div style={{ display:"flex", gap:"16px", marginTop:"8px", paddingTop:"8px", borderTop:"1px solid #f1f5f9" }}>
        <Checkbox field="emailsSent" label="Emails enviados" color="#22c55e" />
        <Checkbox field="invoiceSent" label="Invoice enviada" color="#3b82f6" />
      </div>
    </div>
  );
}

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [activeDay, setActiveDay] = useState("Monday");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "jobs"), orderBy("date", "asc"));
    const unsub = onSnapshot(q, snap => {
      setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const saveJob = async (form) => {
    if (form.id) {
      const { id, ...data } = form;
      await updateDoc(doc(db, "jobs", id), data);
    } else {
      await addDoc(collection(db, "jobs"), form);
    }
    setModal(false); setEditing(null);
  };

  const deleteJob = async (id) => {
    if (window.confirm("Deletar este job?")) await deleteDoc(doc(db, "jobs", id));
  };

  const toggle = async (id, field) => {
    const job = jobs.find(j => j.id === id);
    await updateDoc(doc(db, "jobs", id), { [field]: !job[field] });
  };

  const dayJobs = jobs.filter(j => j.day === activeDay);
  const countActive = (day) => jobs.filter(j => j.day === day && j.status !== "Cancelled").length;

  return (
    <div style={{ minHeight:"100vh", background:"#f0fdf4", fontFamily:"'Inter',sans-serif", color:"#1a2e1a" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#166534,#14532d)",
        padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center",
        position:"sticky", top:0, zIndex:100, boxShadow:"0 2px 8px rgba(0,0,0,0.15)" }}>
        <div>
          <div style={{ fontFamily:"monospace", color:"#ffffff", fontSize:"17px", fontWeight:"700", letterSpacing:"1px" }}>PTM BOOKINGS</div>
          <div style={{ color:"#bbf7d0", fontSize:"11px" }}>Prestige Traffic Management</div>
        </div>
        <button onClick={()=>{ setEditing(null); setModal(true); }} style={{
          background:"#ffffff", border:"none", color:"#166534",
          borderRadius:"8px", padding:"8px 14px", fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>
          + Novo Job
        </button>
      </div>

      {/* Day tabs */}
      <div style={{ display:"flex", overflowX:"auto", borderBottom:"2px solid #bbf7d0",
        background:"#ffffff", padding:"0 6px", gap:"2px" }}>
        {DAYS.map(day => {
          const count = countActive(day);
          const active = day === activeDay;
          return (
            <button key={day} onClick={()=>setActiveDay(day)} style={{
              background:"none", border:"none",
              borderBottom: active ? "3px solid #166534" : "3px solid transparent",
              color: active ? "#166534" : "#94a3b8",
              padding:"10px 12px", fontSize:"11px", fontWeight: active?"700":"500",
              cursor:"pointer", whiteSpace:"nowrap", fontFamily:"monospace",
              letterSpacing:"0.5px", marginBottom:"-2px" }}>
              {day.slice(0,3).toUpperCase()}
              {count > 0 && (
                <span style={{ background: active ? "#166534" : "#e2e8f0",
                  color: active ? "#ffffff" : "#64748b",
                  borderRadius:"10px", fontSize:"10px", fontWeight:"700",
                  padding:"1px 5px", marginLeft:"5px" }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ padding:"14px", maxWidth:"700px", margin:"0 auto" }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:"60px", color:"#94a3b8", fontFamily:"monospace" }}>Carregando...</div>
        ) : dayJobs.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 20px", color:"#94a3b8" }}>
            <div style={{ fontSize:"36px", marginBottom:"10px" }}>📋</div>
            <div style={{ fontFamily:"monospace", fontSize:"13px" }}>Nenhum job para {activeDay}</div>
            <button onClick={()=>{ setEditing(null); setModal(true); }} style={{
              marginTop:"14px", background:"#166534", border:"none",
              color:"#ffffff", borderRadius:"6px", padding:"8px 18px", fontSize:"12px", cursor:"pointer" }}>
              + Adicionar job
            </button>
          </div>
        ) : (
          <>
            <div style={{ color:"#64748b", fontSize:"11px", fontFamily:"monospace", marginBottom:"10px", letterSpacing:"0.5px" }}>
              {dayJobs.length} JOB{dayJobs.length>1?"S":""} • {activeDay.toUpperCase()}
            </div>
            {dayJobs.map(job => (
              <JobCard key={job.id} job={job}
                onEdit={j=>{ setEditing(j); setModal(true); }}
                onDelete={deleteJob} onToggle={toggle} />
            ))}
          </>
        )}
      </div>

      {modal && <Modal job={editing} onSave={saveJob} onClose={()=>{ setModal(false); setEditing(null); }} allJobs={jobs} />}
    </div>
  );
}
