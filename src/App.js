import { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy
} from "firebase/firestore";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const STATUSES = ["Completed","Cancelled","Rescheduled","Pending"];
const STATUS_COLORS = {
  Completed:   { bg:"#1a3a2a", text:"#4ade80", border:"#22c55e" },
  Cancelled:   { bg:"#3a1a1a", text:"#f87171", border:"#ef4444" },
  Rescheduled: { bg:"#3a2e1a", text:"#fbbf24", border:"#f59e0b" },
  Pending:     { bg:"#1a2a3a", text:"#38bdf8", border:"#0ea5e9" },
};

const TC_LIST = [
  "Diego","Ali","Hage","Angel","Victoria","Vivi","Hamid","Hamza",
  "Lilian","Batoul","Mick","Christopher","Marcelo","Khalaf","Sayed",
  "Alpha","Davi","Giovana","Maria Delaix","Momen","Emily","Saad","Bruna"
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

function Modal({ job, onSave, onClose }) {
  const [form, setForm] = useState(job ? { ...job, workers: job.workers || [] } : { ...emptyJob });
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));
  const toggleWorker = (name) => {
    const w = form.workers || [];
    if (w.includes(name)) set("workers", w.filter(x => x !== name));
    else set("workers", [...w, name]);
  };
  const inp = {
    width:"100%", background:"#0f172a", border:"1px solid #1e293b",
    borderRadius:"6px", color:"#e2e8f0", padding:"8px 10px",
    fontSize:"13px", outline:"none", boxSizing:"border-box"
  };
  const lbl = {
    color:"#64748b", fontSize:"11px", fontWeight:"600",
    letterSpacing:"0.8px", textTransform:"uppercase",
    marginBottom:"4px", display:"block"
  };
  return (
    <div style={{ position:"fixed", inset:0, background:"#000000aa", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:"16px" }}>
      <div style={{ background:"linear-gradient(160deg,#0f1a14,#080f0c)",
        border:"1px solid #1e3a2a", borderRadius:"12px", padding:"20px",
        width:"100%", maxWidth:"500px", maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"16px" }}>
          <h2 style={{ color:"#a3e635", fontFamily:"monospace", fontSize:"15px", margin:0 }}>
            {job?.id ? "✏️ Editar Job" : "➕ Novo Job"}
          </h2>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#64748b", fontSize:"20px", cursor:"pointer" }}>✕</button>
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
          <div>
            <label style={lbl}>Team Leader (1st Ute)</label>
            <select style={inp} value={form.teamLeader} onChange={e=>set("teamLeader",e.target.value)}>
              <option value="">Selecionar...</option>
              {TC_LIST.map(n=><option key={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>2nd Ute</label>
            <select style={inp} value={form.ute2||""} onChange={e=>set("ute2",e.target.value)}>
              <option value="">Nenhum</option>
              {TC_LIST.map(n=><option key={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>3rd Ute</label>
            <select style={inp} value={form.ute3||""} onChange={e=>set("ute3",e.target.value)}>
              <option value="">Nenhum</option>
              {TC_LIST.map(n=><option key={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Nº Utes</label>
            <input style={inp} type="number" min="1" value={form.uteCount} onChange={e=>set("uteCount",Number(e.target.value))} />
          </div>
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>TCs na equipe</label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:"6px", marginTop:"4px" }}>
              {TC_LIST.map(name => {
                const selected = (form.workers||[]).includes(name);
                return (
                  <div key={name} onClick={()=>toggleWorker(name)} style={{
                    padding:"4px 10px", borderRadius:"20px", fontSize:"12px",
                    cursor:"pointer", transition:"all 0.15s",
                    background: selected ? "#166534" : "#1e293b",
                    color: selected ? "#4ade80" : "#64748b",
                    border: `1px solid ${selected ? "#22c55e" : "#334155"}`,
                    userSelect:"none"
                  }}>{name}</div>
                );
              })}
            </div>
            <div style={{ color:"#475569", fontSize:"11px", marginTop:"6px" }}>
              {(form.workers||[]).length} TC{(form.workers||[]).length !== 1 ? "s" : ""} selecionado{(form.workers||[]).length !== 1 ? "s" : ""}
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
          <button onClick={onClose} style={{ flex:1, background:"#1e293b", border:"1px solid #334155",
            color:"#94a3b8", borderRadius:"6px", padding:"10px", fontSize:"13px", cursor:"pointer" }}>
            Cancelar
          </button>
          <button onClick={()=>onSave(form)} style={{ flex:2,
            background:"linear-gradient(135deg,#166534,#14532d)",
            border:"1px solid #22c55e44", color:"#4ade80",
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
  const Checkbox = ({ field, label, color }) => (
    <div onClick={()=>onToggle(job.id, field)} style={{ display:"flex", alignItems:"center", gap:"6px", cursor:"pointer" }}>
      <div style={{ width:"18px", height:"18px", borderRadius:"4px", transition:"all 0.2s",
        background: job[field] ? (field==="emailsSent"?"#166534":"#1e3a5f") : "#1e293b",
        border: `2px solid ${job[field] ? color : "#334155"}`,
        display:"flex", alignItems:"center", justifyContent:"center" }}>
        {job[field] && <span style={{ color, fontSize:"12px", fontWeight:"bold" }}>✓</span>}
      </div>
      <span style={{ color: job[field] ? color : "#64748b", fontSize:"12px", fontWeight:"500" }}>{label}</span>
    </div>
  );
  const utes = [job.teamLeader, job.ute2, job.ute3].filter(Boolean);
  return (
    <div style={{ background:"linear-gradient(135deg,#0f1a14,#0a1210)",
      border:`1px solid ${sc.border}33`, borderLeft:`3px solid ${sc.border}`,
      borderRadius:"8px", padding:"14px 16px", marginBottom:"10px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"8px" }}>
        <div>
          <span style={{ color:"#a3e635", fontFamily:"monospace", fontSize:"13px", fontWeight:"700" }}>{job.client}</span>
          <span style={{ color:"#64748b", fontSize:"12px", marginLeft:"10px" }}>{job.date}</span>
        </div>
        <div style={{ display:"flex", gap:"6px" }}>
          <span style={{ background:sc.bg, color:sc.text, border:`1px solid ${sc.border}44`,
            borderRadius:"4px", fontSize:"10px", fontWeight:"700", padding:"2px 8px",
            textTransform:"uppercase", letterSpacing:"0.8px" }}>{job.status}</span>
          <button onClick={()=>onEdit(job)} style={{ background:"#1e293b", border:"1px solid #334155",
            color:"#94a3b8", borderRadius:"4px", padding:"3px 8px", fontSize:"11px", cursor:"pointer" }}>Edit</button>
          <button onClick={()=>onDelete(job.id)} style={{ background:"#3a1a1a", border:"1px solid #ef444444",
            color:"#f87171", borderRadius:"4px", padding:"3px 8px", fontSize:"11px", cursor:"pointer" }}>✕</button>
        </div>
      </div>
      <div style={{ color:"#cbd5e1", fontSize:"12px", marginBottom:"6px" }}>
        <span style={{ color:"#38bdf8" }}>⏰ {job.time}</span>
        <span style={{ color:"#475569", margin:"0 8px" }}>•</span>
        <span>{job.address}</span>
        {job.workOrderRef && <span style={{ color:"#64748b", marginLeft:"8px", fontSize:"11px" }}>({job.workOrderRef})</span>}
      </div>
      <div style={{ fontSize:"12px", marginBottom:"6px" }}>
        {utes.map((u,i) => (
          <span key={i} style={{ marginRight:"10px" }}>
            <span style={{ color:"#f59e0b", fontWeight:"600" }}>🚐 {u}</span>
            <span style={{ color:"#475569", fontSize:"10px", marginLeft:"3px" }}>({i===0?"1st":i===1?"2nd":"3rd"} ute)</span>
          </span>
        ))}
      </div>
      {workers.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:"4px", marginBottom:"8px" }}>
          {workers.map(w => (
            <span key={w} style={{ background:"#1e293b", color:"#94a3b8", borderRadius:"10px",
              fontSize:"11px", padding:"2px 8px", border:"1px solid #334155" }}>{w}</span>
          ))}
          <span style={{ color:"#475569", fontSize:"11px", alignSelf:"center", marginLeft:"4px" }}>
            · {workers.length}TC / {job.uteCount} ute{job.uteCount>1?"s":""}
          </span>
        </div>
      )}
      {job.notes && (
        <div style={{ color:"#64748b", fontSize:"11px", fontStyle:"italic",
          marginBottom:"8px", borderLeft:"2px solid #334155", paddingLeft:"8px" }}>
          {job.notes}
        </div>
      )}
      <div style={{ display:"flex", gap:"16px", marginTop:"6px" }}>
        <Checkbox field="emailsSent" label="Emails enviados" color="#4ade80" />
        <Checkbox field="invoiceSent" label="Invoice enviada" color="#38bdf8" />
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
    <div style={{ minHeight:"100vh", background:"#060d09", fontFamily:"'Inter',sans-serif", color:"#e2e8f0" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      <div style={{ background:"linear-gradient(135deg,#0f1a14,#060d09)",
        borderBottom:"1px solid #1e3a2a", padding:"14px 16px",
        display:"flex", justifyContent:"space-between", alignItems:"center",
        position:"sticky", top:0, zIndex:100 }}>
        <div>
          <div style={{ fontFamily:"monospace", color:"#a3e635", fontSize:"17px", fontWeight:"700", letterSpacing:"1px" }}>PTM BOOKINGS</div>
          <div style={{ color:"#475569", fontSize:"11px" }}>Prestige Traffic Management</div>
        </div>
        <button onClick={()=>{ setEditing(null); setModal(true); }} style={{
          background:"linear-gradient(135deg,#166534,#14532d)",
          border:"1px solid #22c55e55", color:"#4ade80",
          borderRadius:"8px", padding:"8px 14px", fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>
          + Novo Job
        </button>
      </div>
      <div style={{ display:"flex", overflowX:"auto", borderBottom:"1px solid #1e293b",
        background:"#080f0c", padding:"0 6px", gap:"2px" }}>
        {DAYS.map(day => {
          const count = countActive(day);
          const active = day === activeDay;
          return (
            <button key={day} onClick={()=>setActiveDay(day)} style={{
              background: active ? "#0f1a14" : "none", border:"none",
              borderBottom: active ? "2px solid #a3e635" : "2px solid transparent",
              color: active ? "#a3e635" : "#475569",
              padding:"10px 12px", fontSize:"11px", fontWeight: active?"700":"500",
              cursor:"pointer", whiteSpace:"nowrap", fontFamily:"monospace", letterSpacing:"0.5px" }}>
              {day.slice(0,3).toUpperCase()}
              {count > 0 && (
                <span style={{ background:"#166534", color:"#4ade80",
                  borderRadius:"10px", fontSize:"10px", fontWeight:"700",
                  padding:"1px 5px", marginLeft:"5px" }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ padding:"14px", maxWidth:"700px", margin:"0 auto" }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:"60px", color:"#334155", fontFamily:"monospace" }}>Carregando...</div>
        ) : dayJobs.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 20px", color:"#334155" }}>
            <div style={{ fontSize:"36px", marginBottom:"10px" }}>📋</div>
            <div style={{ fontFamily:"monospace", fontSize:"13px" }}>Nenhum job para {activeDay}</div>
            <button onClick={()=>{ setEditing(null); setModal(true); }} style={{
              marginTop:"14px", background:"#0f1a14", border:"1px solid #1e3a2a",
              color:"#4ade80", borderRadius:"6px", padding:"8px 18px", fontSize:"12px", cursor:"pointer" }}>
              + Adicionar job
            </button>
          </div>
        ) : (
          <>
            <div style={{ color:"#475569", fontSize:"11px", fontFamily:"monospace", marginBottom:"10px", letterSpacing:"0.5px" }}>
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
      {modal && <Modal job={editing} onSave={saveJob} onClose={()=>{ setModal(false); setEditing(null); }} />}
    </div>
  );
}
