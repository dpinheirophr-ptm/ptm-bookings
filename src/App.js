import { useState, useEffect } from "react";
import { db, storage } from "./firebase";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from "firebase/firestore";
import { ref as fbRef, uploadBytes, getDownloadURL } from "firebase/storage";

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
const TC_TYPES = ["TCR","IMP","PWZ"];
const WORKER_ROLES = ["Traffic Controller","Team Leader"];
const AVATAR_COLORS = ["#166534","#1e40af","#6b21a8","#854d0e","#991b1b","#065f46","#1e3a8a","#7c2d12"];
const DEFAULT_TLS = ["Diego","Angel","Hage","Lilian","Victoria","Mick","Hamza","Hamid","Sayed","Bruna Gomes"];
const DEFAULT_TCS = ["Diego","Ali","Hage","Angel","Victoria","Vivi","Hamid","Hamza","Lilian","Batoul","Mick","Christopher","Marcelo","Khalaf","Sayed","Alpha","Davi","Giovana","Maria Delaix","Momen","Emily","Saad","Bruna"];
const DRIVE_SECTIONS = [
  { id:"quotes",    icon:"📋", label:"QUOTES",   title:"Quotes",    link:"" },
  { id:"invoices",  icon:"🧾", label:"INVOICES", title:"Invoices",  link:"" },
  { id:"tgs",       icon:"🗺️",  label:"TGS",      title:"TGS",       link:"" },
  { id:"utes",      icon:"🚐", label:"UTES",     title:"Utes",      link:"" },
  { id:"equipment", icon:"🔧", label:"EQUIP",    title:"Equipment", link:"" },
  { id:"documents", icon:"📁", label:"DOCS",     title:"Documents", link:"" },
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
var emptyWorker = { name:"", roles:["Traffic Controller"], status:"Active", dob:"", address:"", phone:"", email:"", emergencyContact:"", emergencyPhone:"", driveFolderLink:"", profilePhoto:"", whiteCardNumber:"", whiteCardIssue:"", whiteCardFront:"", whiteCardBack:"", tcCardNumber:"", tcCardTypes:[], tcCardIssue:"", tcCardFront:"", tcCardBack:"", licenceNumber:"", licenceCardNumber:"", licenceExpiry:"", licenceFront:"", licenceBack:"", notes:"" };

var INP = { width:"100%", background:"#f8fafc", border:"1px solid #cbd5e1", borderRadius:"6px", color:"#1a2e1a", padding:"8px 10px", fontSize:"13px", outline:"none", boxSizing:"border-box" };
var LBL = { color:"#166534", fontSize:"11px", fontWeight:"700", letterSpacing:"0.8px", textTransform:"uppercase", marginBottom:"4px", display:"block" };
var SHDR = { color:"#166534", fontSize:"11px", fontWeight:"700", letterSpacing:"1px", marginBottom:"10px", paddingBottom:"6px", borderBottom:"2px solid #bbf7d0" };

function getWorkerRoles(w) { if(Array.isArray(w.roles)&&w.roles.length>0) return w.roles; if(w.role) return [w.role]; return ["Traffic Controller"]; }
function getWorkerTCTypes(w) { if(Array.isArray(w.tcCardTypes)&&w.tcCardTypes.length>0) return w.tcCardTypes; if(w.tcCardType) return [w.tcCardType]; return []; }
function padZ(n) { return n < 10 ? "0"+n : ""+n; }
function formatDate(d) { return d.getFullYear()+"-"+padZ(d.getMonth()+1)+"-"+padZ(d.getDate()); }
function getInitials(name) { var p=(name||"?").split(" "); return p.length>=2?(p[0][0]+p[1][0]).toUpperCase():p[0].slice(0,2).toUpperCase(); }
function getAvatarColor(name) { return AVATAR_COLORS[(name||"").charCodeAt(0)%AVATAR_COLORS.length]; }
function isExpired(d) { return d&&new Date(d)<new Date(); }
function isExpiringSoon(d) { if(!d) return false; var diff=(new Date(d)-new Date())/(86400000); return diff>=0&&diff<=60; }

function getMonthDays(year, month) {
  var first=new Date(year,month,1), last=new Date(year,month+1,0);
  var dow=first.getDay(), offset=dow===0?6:dow-1, days=[], next=1;
  for(var i=offset;i>0;i--) days.push({date:new Date(year,month,1-i),current:false});
  for(var i=1;i<=last.getDate();i++) days.push({date:new Date(year,month,i),current:true});
  while(days.length%7!==0) days.push({date:new Date(year,month+1,next++),current:false});
  return days;
}

function getBusy(jobs, day, excludeId) {
  var busy={};
  jobs.forEach(function(j){
    if(j.day===day&&j.id!==excludeId&&j.status!=="Cancelled"){
      if(j.teamLeader) busy[j.teamLeader]=true;
      if(j.ute2) busy[j.ute2]=true;
      if(j.ute3) busy[j.ute3]=true;
      (Array.isArray(j.workers)?j.workers:[]).forEach(function(n){busy[n]=true;});
    }
  });
  return busy;
}

// ── Photo Upload ──────────────────────────────────────────────────
function PhotoUpload(props) {
  var s1=useState(false); var loading=s1[0]; var setLoading=s1[1];
  var s2=useState(""); var err=s2[0]; var setErr=s2[1];

  function handleChange(e) {
    var file=e.target.files&&e.target.files[0];
    if(!file) return;
    setLoading(true); setErr("");
    var path="workers/"+props.path+"/"+Date.now()+"_"+file.name.replace(/\s/g,"_");
    uploadBytes(fbRef(storage,path),file).then(function(snap){return getDownloadURL(snap.ref);}).then(function(url){
      props.onChange(url); setLoading(false);
    }).catch(function(){setErr("Enable Firebase Storage first."); setLoading(false);});
  }

  if(props.value) return (
    <div>
      <label style={LBL}>{props.label}</label>
      <div style={{ position:"relative" }}>
        <img src={props.value} alt="" style={{ width:"100%", maxHeight:"110px", objectFit:"cover", borderRadius:"6px", border:"1px solid #bbf7d0" }} />
        <button onClick={function(){props.onChange("");}} style={{ position:"absolute", top:"4px", right:"4px", background:"#ef4444", border:"none", color:"#fff", borderRadius:"50%", width:"22px", height:"22px", cursor:"pointer", fontSize:"14px" }}>×</button>
      </div>
    </div>
  );
  return (
    <div>
      <label style={LBL}>{props.label}</label>
      <label style={{ display:"block", border:"2px dashed #bbf7d0", borderRadius:"6px", padding:"12px 8px", textAlign:"center", cursor:"pointer", background:"#f0fdf4", color:"#166534", fontSize:"12px", fontWeight:"600" }}>
        <input type="file" accept="image/*" onChange={handleChange} style={{ display:"none" }} />
        {loading?"⏳ Uploading...":"📷 "+props.label}
      </label>
      {err?<div style={{ color:"#ef4444", fontSize:"10px", marginTop:"3px" }}>{err}</div>:null}
    </div>
  );
}

// ── Worker Modal ──────────────────────────────────────────────────
function WorkerModal(props) {
  var w=props.worker;
  var init=Object.assign({},emptyWorker,w||{});
  init.roles = getWorkerRoles(init);
  init.tcCardTypes = getWorkerTCTypes(init);
  var sf=useState(init); var form=sf[0]; var setForm=sf[1];
  var s2=useState(false); var saving=s2[0]; var setSaving=s2[1];
  var s3=useState(0); var activeTab=s3[0]; var setActiveTab=s3[1];
  function setF(k,v){setForm(function(f){return Object.assign({},f,{[k]:v});});}
  var workerPath=(form.name||"worker").replace(/\s/g,"_").toLowerCase()+"_"+(w&&w.id?w.id:Date.now());
  var tabs=["👤 Personal","📋 White Card","🪪 TC Card","🚗 Licence"];

  function doSave(){
    if(!form.name||!form.name.trim()){alert("Please enter a name.");return;}
    setSaving(true);
    props.onSave(form);
  }

  var SaveBtn = (
    <button onClick={doSave} disabled={saving} style={{ background:"linear-gradient(135deg,#166534,#14532d)", border:"none", color:"#fff", borderRadius:"6px", padding:"10px 20px", fontSize:"13px", cursor:"pointer", fontWeight:"700", opacity:saving?0.7:1 }}>
      {saving?"Saving...":"💾 Save Worker"}
    </button>
  );

  return (
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.6)", zIndex:9999, overflowY:"auto" }}>
      <div style={{ background:"#fff", borderRadius:"12px", maxWidth:"560px", margin:"20px auto 60px auto", boxShadow:"0 10px 40px rgba(0,0,0,0.25)", border:"1px solid #bbf7d0", overflow:"hidden" }}>

        {/* Header */}
        <div style={{ background:"linear-gradient(135deg,#166534,#14532d)", padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
            {form.profilePhoto?(<img src={form.profilePhoto} alt="" style={{ width:"44px", height:"44px", borderRadius:"50%", objectFit:"cover", border:"2px solid rgba(255,255,255,0.5)" }} />):(
              <div style={{ width:"44px", height:"44px", borderRadius:"50%", background:"rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:"700", fontSize:"16px" }}>{getInitials(form.name)}</div>
            )}
            <div>
              <div style={{ color:"#fff", fontFamily:"monospace", fontSize:"15px", fontWeight:"700" }}>{w&&w.id?"Edit Worker":"New Worker"}</div>
              {form.name?<div style={{ color:"#bbf7d0", fontSize:"12px" }}>{form.name}</div>:null}
            </div>
          </div>
          <button onClick={props.onClose} style={{ background:"rgba(255,255,255,0.2)", border:"none", color:"#fff", borderRadius:"8px", width:"32px", height:"32px", cursor:"pointer", fontSize:"18px" }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", background:"#f0fdf4", borderBottom:"2px solid #bbf7d0" }}>
          {tabs.map(function(t,i){return <button key={i} onClick={function(){setActiveTab(i);}} style={{ flex:1, background:"none", border:"none", borderBottom:activeTab===i?"3px solid #166534":"3px solid transparent", color:activeTab===i?"#166534":"#94a3b8", padding:"10px 4px", fontSize:"11px", fontWeight:activeTab===i?"700":"500", cursor:"pointer", marginBottom:"-2px" }}>{t}</button>;})}
        </div>

        <div style={{ padding:"20px" }}>

          {/* Tab 0: Personal */}
          {activeTab===0?(
            <div>
              <div style={SHDR}>PERSONAL INFO</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"12px" }}>
                <div style={{ gridColumn:"1/-1" }}><label style={LBL}>Full Name *</label><input style={INP} value={form.name} onChange={function(e){setF("name",e.target.value);}} placeholder="Ex: John Smith" /></div>
                <div style={{ gridColumn:"1/-1" }}>
                  <label style={LBL}>Role <span style={{ color:"#94a3b8", fontWeight:"400", textTransform:"none", letterSpacing:0 }}>(select all that apply)</span></label>
                  <div style={{ display:"flex", gap:"8px" }}>
                    {WORKER_ROLES.map(function(r){
                      var roles=Array.isArray(form.roles)?form.roles:[];
                      var sel=roles.indexOf(r)>=0;
                      function toggle(){
                        var arr=roles.slice();
                        var idx=arr.indexOf(r);
                        if(idx>=0) arr.splice(idx,1); else arr.push(r);
                        setF("roles",arr);
                      }
                      return <button key={r} type="button" onClick={toggle} style={{ flex:1, padding:"10px", borderRadius:"8px", border:"2px solid "+(sel?"#166534":"#cbd5e1"), background:sel?"#166534":"#f8fafc", color:sel?"#fff":"#64748b", fontSize:"13px", fontWeight:"700", cursor:"pointer", position:"relative" }}>
                        {r==="Team Leader"?"🚐 Team Leader":"👷 Traffic Controller"}
                        {sel?<span style={{ position:"absolute", top:"-6px", right:"-6px", background:"#22c55e", color:"#fff", borderRadius:"50%", width:"18px", height:"18px", fontSize:"12px", display:"flex", alignItems:"center", justifyContent:"center" }}>✓</span>:null}
                      </button>;
                    })}
                  </div>
                  {(Array.isArray(form.roles)?form.roles:[]).length===0?<div style={{ color:"#ef4444", fontSize:"11px", marginTop:"4px" }}>Please select at least one role</div>:null}
                </div>
                <div><label style={LBL}>Status</label><select style={INP} value={form.status} onChange={function(e){setF("status",e.target.value);}}><option>Active</option><option>Inactive</option></select></div>
                <div><label style={LBL}>Date of Birth</label><input style={INP} type="date" value={form.dob} onChange={function(e){setF("dob",e.target.value);}} /></div>
                <div><label style={LBL}>Phone</label><input style={INP} value={form.phone} onChange={function(e){setF("phone",e.target.value);}} placeholder="04XX XXX XXX" /></div>
                <div style={{ gridColumn:"1/-1" }}><label style={LBL}>Email</label><input style={INP} value={form.email} onChange={function(e){setF("email",e.target.value);}} placeholder="email@example.com" /></div>
                <div style={{ gridColumn:"1/-1" }}><label style={LBL}>Address</label><input style={INP} value={form.address} onChange={function(e){setF("address",e.target.value);}} placeholder="Full address" /></div>
              </div>
              <div style={SHDR}>EMERGENCY CONTACT</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"12px" }}>
                <div><label style={LBL}>Contact Name</label><input style={INP} value={form.emergencyContact} onChange={function(e){setF("emergencyContact",e.target.value);}} placeholder="Name" /></div>
                <div><label style={LBL}>Contact Phone</label><input style={INP} value={form.emergencyPhone} onChange={function(e){setF("emergencyPhone",e.target.value);}} placeholder="04XX XXX XXX" /></div>
              </div>
              <div style={SHDR}>PROFILE & DRIVE</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"12px" }}>
                <PhotoUpload label="Profile Photo" value={form.profilePhoto} onChange={function(v){setF("profilePhoto",v);}} path={workerPath+"_profile"} />
                <div><label style={LBL}>Google Drive Folder</label><input style={INP} value={form.driveFolderLink} onChange={function(e){setF("driveFolderLink",e.target.value);}} placeholder="Paste Drive link..." /><div style={{ color:"#94a3b8", fontSize:"10px", marginTop:"4px" }}>Create folder in Drive, then paste link here</div></div>
              </div>
              <div style={{ marginBottom:"4px" }}><label style={LBL}>Notes</label><textarea style={{ width:"100%", background:"#f8fafc", border:"1px solid #cbd5e1", borderRadius:"6px", color:"#1a2e1a", padding:"8px 10px", fontSize:"13px", outline:"none", boxSizing:"border-box", minHeight:"60px", resize:"vertical" }} value={form.notes} onChange={function(e){setF("notes",e.target.value);}} placeholder="Additional notes..." /></div>
            </div>
          ):null}

          {/* Tab 1: White Card */}
          {activeTab===1?(
            <div>
              <div style={SHDR}>WHITE CARD (Construction Induction)</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"16px" }}>
                <div><label style={LBL}>Card Number</label><input style={INP} value={form.whiteCardNumber} onChange={function(e){setF("whiteCardNumber",e.target.value);}} placeholder="Card number" /></div>
                <div><label style={LBL}>Date of Issue</label><input style={INP} type="date" value={form.whiteCardIssue} onChange={function(e){setF("whiteCardIssue",e.target.value);}} /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                <PhotoUpload label="Front Photo" value={form.whiteCardFront} onChange={function(v){setF("whiteCardFront",v);}} path={workerPath+"_wcfront"} />
                <PhotoUpload label="Back Photo" value={form.whiteCardBack} onChange={function(v){setF("whiteCardBack",v);}} path={workerPath+"_wcback"} />
              </div>
            </div>
          ):null}

          {/* Tab 2: TC Card */}
          {activeTab===2?(
            <div>
              <div style={SHDR}>TRAFFIC CONTROLLER CARD</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"12px" }}>
                <div><label style={LBL}>Card Number</label><input style={INP} value={form.tcCardNumber} onChange={function(e){setF("tcCardNumber",e.target.value);}} placeholder="TC card number" /></div>
                <div><label style={LBL}>Date of Issue</label><input style={INP} type="date" value={form.tcCardIssue} onChange={function(e){setF("tcCardIssue",e.target.value);}} /></div>
                <div style={{ gridColumn:"1/-1" }}>
                  <label style={LBL}>Type of TC <span style={{ color:"#94a3b8", fontWeight:"400", textTransform:"none", letterSpacing:0 }}>(select all that apply)</span></label>
                  <div style={{ display:"flex", gap:"8px" }}>
                    {TC_TYPES.map(function(t){
                      var types=Array.isArray(form.tcCardTypes)?form.tcCardTypes:[];
                      var sel=types.indexOf(t)>=0;
                      function toggle(){
                        var arr=types.slice();
                        var idx=arr.indexOf(t);
                        if(idx>=0) arr.splice(idx,1); else arr.push(t);
                        setF("tcCardTypes",arr);
                      }
                      return <button key={t} type="button" onClick={toggle} style={{ flex:1, padding:"14px", borderRadius:"8px", border:"2px solid "+(sel?"#166534":"#cbd5e1"), background:sel?"#166534":"#f8fafc", color:sel?"#fff":"#64748b", fontSize:"16px", fontWeight:"700", cursor:"pointer", position:"relative" }}>
                        {t}
                        {sel?<span style={{ position:"absolute", top:"-6px", right:"-6px", background:"#22c55e", color:"#fff", borderRadius:"50%", width:"18px", height:"18px", fontSize:"12px", display:"flex", alignItems:"center", justifyContent:"center" }}>✓</span>:null}
                      </button>;
                    })}
                  </div>
                  {(Array.isArray(form.tcCardTypes)?form.tcCardTypes:[]).length>0?<div style={{ color:"#166534", fontSize:"11px", marginTop:"6px", fontWeight:"600" }}>Selected: {(Array.isArray(form.tcCardTypes)?form.tcCardTypes:[]).join(" + ")}</div>:null}
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                <PhotoUpload label="Front Photo" value={form.tcCardFront} onChange={function(v){setF("tcCardFront",v);}} path={workerPath+"_tcfront"} />
                <PhotoUpload label="Back Photo" value={form.tcCardBack} onChange={function(v){setF("tcCardBack",v);}} path={workerPath+"_tcback"} />
              </div>
            </div>
          ):null}

          {/* Tab 3: Driver's Licence */}
          {activeTab===3?(
            <div>
              <div style={SHDR}>DRIVER'S LICENCE</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"12px" }}>
                <div><label style={LBL}>Licence Number</label><input style={INP} value={form.licenceNumber} onChange={function(e){setF("licenceNumber",e.target.value);}} placeholder="Licence number" /></div>
                <div><label style={LBL}>Card Number</label><input style={INP} value={form.licenceCardNumber} onChange={function(e){setF("licenceCardNumber",e.target.value);}} placeholder="Card number" /></div>
                <div style={{ gridColumn:"1/-1" }}><label style={LBL}>Expiry Date {isExpired(form.licenceExpiry)?"🔴 EXPIRED":isExpiringSoon(form.licenceExpiry)?"🟡 Expiring soon":""}</label><input style={Object.assign({},INP,{borderColor:isExpired(form.licenceExpiry)?"#ef4444":isExpiringSoon(form.licenceExpiry)?"#f59e0b":"#cbd5e1"})} type="date" value={form.licenceExpiry} onChange={function(e){setF("licenceExpiry",e.target.value);}} /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                <PhotoUpload label="Front Photo" value={form.licenceFront} onChange={function(v){setF("licenceFront",v);}} path={workerPath+"_licfront"} />
                <PhotoUpload label="Back Photo" value={form.licenceBack} onChange={function(v){setF("licenceBack",v);}} path={workerPath+"_licback"} />
              </div>
            </div>
          ):null}
        </div>

        {/* Footer — Save always visible */}
        <div style={{ padding:"16px 20px", borderTop:"1px solid #f1f5f9", background:"#fafafa" }}>
          <div style={{ display:"flex", gap:"8px", alignItems:"center", marginBottom:"8px" }}>
            {tabs.map(function(t,i){return <button key={i} onClick={function(){setActiveTab(i);}} style={{ flex:1, background:activeTab===i?"#166534":"#f0fdf4", border:"1px solid "+(activeTab===i?"#166534":"#bbf7d0"), color:activeTab===i?"#fff":"#166534", borderRadius:"6px", padding:"6px 4px", fontSize:"10px", fontWeight:"700", cursor:"pointer" }}>{t.split(" ")[0]}</button>;})}
          </div>
          <div style={{ display:"flex", gap:"10px" }}>
            {w&&w.id?<button onClick={function(){props.onDelete(w.id);}} style={{ background:"#fff0f0", border:"1px solid #fecaca", color:"#ef4444", borderRadius:"6px", padding:"10px 14px", fontSize:"12px", cursor:"pointer" }}>🗑</button>:null}
            <button onClick={props.onClose} style={{ flex:1, background:"#f1f5f9", border:"1px solid #cbd5e1", color:"#64748b", borderRadius:"6px", padding:"10px", fontSize:"13px", cursor:"pointer" }}>Cancel</button>
            {SaveBtn}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Worker Card ───────────────────────────────────────────────────
function WorkerCard(props) {
  var w=props.worker;
  var wRoles=getWorkerRoles(w);
  var isTL=wRoles.indexOf("Team Leader")>=0;
  var isTC=wRoles.indexOf("Traffic Controller")>=0;
  var roleColor=isTL&&isTC?"#6b21a8":isTL?"#1e40af":"#166534";
  var roleBg=isTL&&isTC?"#f3e8ff":isTL?"#dbeafe":"#dcfce7";
  var lcExp=isExpired(w.licenceExpiry), lcExp2=isExpiringSoon(w.licenceExpiry);
  return (
    <div onClick={function(){props.onEdit(w);}} style={{ background:"#fff", borderRadius:"10px", border:"1px solid #e2e8f0", boxShadow:"0 1px 4px rgba(0,0,0,0.06)", cursor:"pointer", overflow:"hidden", opacity:w.status==="Inactive"?0.6:1 }}>
      {w.profilePhoto?(
        <img src={w.profilePhoto} alt="" style={{ width:"100%", height:"80px", objectFit:"cover", display:"block" }} />
      ):(
        <div style={{ height:"70px", background:"linear-gradient(135deg,"+getAvatarColor(w.name)+","+getAvatarColor(w.name)+"99)", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <span style={{ color:"#fff", fontSize:"28px", fontWeight:"700" }}>{getInitials(w.name)}</span>
        </div>
      )}
      <div style={{ padding:"12px" }}>
        <div style={{ fontWeight:"700", fontSize:"13px", color:"#1a2e1a", marginBottom:"4px" }}>{w.name}</div>
        <span style={{ background:roleBg, color:roleColor, borderRadius:"4px", fontSize:"10px", fontWeight:"700", padding:"2px 7px" }}>{wRoles.join(" + ")}</span>
        <div style={{ marginTop:"8px", fontSize:"11px", color:"#64748b" }}>
          {w.phone?<div style={{ marginBottom:"3px" }}>📞 {w.phone}</div>:null}
          {w.tcCardNumber?<div style={{ marginBottom:"3px" }}>🪪 TC: {w.tcCardNumber}{getWorkerTCTypes(w).length>0?" ("+getWorkerTCTypes(w).join("+")+")" :""}</div>:null}
          {w.licenceExpiry?<div style={{ color:lcExp?"#ef4444":lcExp2?"#f59e0b":"#64748b", fontWeight:lcExp||lcExp2?"700":"400" }}>🚗 {lcExp?"EXPIRED":lcExp2?"Expires soon":w.licenceExpiry}</div>:null}
        </div>
        <div style={{ display:"flex", gap:"4px", marginTop:"8px", flexWrap:"wrap" }}>
          {w.whiteCardNumber?<span style={{ background:"#f0fdf4", color:"#166534", fontSize:"9px", fontWeight:"700", padding:"2px 5px", borderRadius:"3px", border:"1px solid #bbf7d0" }}>WHITE ✓</span>:null}
          {w.tcCardNumber?<span style={{ background:"#dbeafe", color:"#1e40af", fontSize:"9px", fontWeight:"700", padding:"2px 5px", borderRadius:"3px", border:"1px solid #93c5fd" }}>TC ✓</span>:null}
          {w.licenceNumber?<span style={{ background:"#f3e8ff", color:"#6b21a8", fontSize:"9px", fontWeight:"700", padding:"2px 5px", borderRadius:"3px", border:"1px solid #d8b4fe" }}>LIC ✓</span>:null}
          {w.driveFolderLink?<a href={w.driveFolderLink} target="_blank" rel="noreferrer" onClick={function(e){e.stopPropagation();}} style={{ background:"#fef9c3", color:"#854d0e", fontSize:"9px", fontWeight:"700", padding:"2px 5px", borderRadius:"3px", border:"1px solid #fde047", textDecoration:"none" }}>📁 DRIVE</a>:null}
        </div>
        <div style={{ marginTop:"8px", paddingTop:"6px", borderTop:"1px solid #f1f5f9", color:"#166534", fontSize:"10px", fontWeight:"600", textAlign:"right" }}>Tap to edit →</div>
      </div>
    </div>
  );
}

// ── Team Page ─────────────────────────────────────────────────────
function TeamPage(props) {
  var workers=props.workers;
  var s1=useState("all"); var filterRole=s1[0]; var setFilterRole=s1[1];
  var s2=useState(""); var search=s2[0]; var setSearch=s2[1];
  var filtered=workers.filter(function(w){
    var mr=filterRole==="all"||getWorkerRoles(w).indexOf(filterRole)>=0;
    return mr&&(!search||w.name.toLowerCase().indexOf(search.toLowerCase())>=0);
  });
  var activeCount=workers.filter(function(w){return w.status!=="Inactive";}).length;
  var expiredCount=workers.filter(function(w){return isExpired(w.licenceExpiry);}).length;
  var expiringCount=workers.filter(function(w){return isExpiringSoon(w.licenceExpiry);}).length;
  return (
    <div style={{ padding:"16px", maxWidth:"900px", margin:"0 auto" }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"10px", marginBottom:"16px" }}>
        {[{l:"Active Workers",v:activeCount,c:"#166534",bg:"#dcfce7"},{l:"Licences Expiring",v:expiringCount,c:"#854d0e",bg:"#fef9c3"},{l:"Licences Expired",v:expiredCount,c:"#991b1b",bg:"#fee2e2"}].map(function(s){return <div key={s.l} style={{ background:s.bg, borderRadius:"8px", padding:"12px 16px", border:"1px solid "+s.c+"44" }}><div style={{ color:s.c, fontSize:"24px", fontWeight:"700", fontFamily:"monospace" }}>{s.v}</div><div style={{ color:s.c, fontSize:"11px", fontWeight:"600" }}>{s.l}</div></div>;})}
      </div>
      <div style={{ display:"flex", gap:"8px", marginBottom:"16px", flexWrap:"wrap" }}>
        <input style={{ flex:1, minWidth:"150px", background:"#fff", border:"1px solid #cbd5e1", borderRadius:"6px", color:"#1a2e1a", padding:"8px 12px", fontSize:"13px", outline:"none" }} value={search} onChange={function(e){setSearch(e.target.value);}} placeholder="🔍  Search by name..." />
        {["all","Team Leader","Traffic Controller"].map(function(r){return <button key={r} onClick={function(){setFilterRole(r);}} style={{ background:filterRole===r?"#166534":"#fff", border:"1px solid "+(filterRole===r?"#166534":"#cbd5e1"), color:filterRole===r?"#fff":"#64748b", borderRadius:"6px", padding:"8px 14px", fontSize:"12px", fontWeight:"600", cursor:"pointer" }}>{r==="all"?"All":r==="Team Leader"?"Team Leaders":"TCs"}</button>;}) }
      </div>
      {filtered.length===0?(
        <div style={{ textAlign:"center", padding:"60px", color:"#94a3b8" }}>
          <div style={{ fontSize:"40px", marginBottom:"10px" }}>👷</div>
          <div style={{ fontSize:"14px", marginBottom:"4px" }}>No workers found</div>
          <div style={{ fontSize:"12px" }}>Click "+ New Worker" to add one</div>
        </div>
      ):(
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:"12px" }}>
          {filtered.map(function(w){return <WorkerCard key={w.id} worker={w} onEdit={props.onEdit} />;})}
        </div>
      )}
    </div>
  );
}

// ── Job Modal ─────────────────────────────────────────────────────
function JobModal(props) {
  var job=props.job, tls=props.tls, tcs=props.tcs;
  var initW=Array.isArray(job.workers)?job.workers.slice():[];
  var init=Object.assign({},emptyJob,job,{workers:initW});
  var sf=useState(init); var form=sf[0]; var setForm=sf[1];
  var s2=useState(false); var saving=s2[0]; var setSaving=s2[1];
  var busy=getBusy(props.allJobs||[],form.day,job.id||null);
  var workers=Array.isArray(form.workers)?form.workers:[];
  function setF(k,v){setForm(function(f){return Object.assign({},f,{[k]:v});});}
  function toggleW(name){var w=workers.slice(),idx=w.indexOf(name);if(idx>=0)w.splice(idx,1);else w.push(name);setF("workers",w);}
  function doSave(){
    if(!form.client||!form.client.trim()){alert("Please enter a client name.");return;}
    setSaving(true);
    props.onSave(form);
  }
  return (
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.55)", zIndex:9999, overflowY:"auto" }}>
      <div style={{ background:"#fff", borderRadius:"12px", padding:"20px", maxWidth:"500px", margin:"30px auto 60px auto", boxShadow:"0 10px 40px rgba(0,0,0,0.2)", border:"1px solid #bbf7d0" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" }}>
          <h2 style={{ color:"#166534", margin:0, fontSize:"16px", fontFamily:"monospace" }}>{job.id?"Edit Job":"New Job"}</h2>
          <button onClick={props.onClose} style={{ background:"none", border:"none", fontSize:"24px", cursor:"pointer", color:"#94a3b8" }}>×</button>
        </div>
        <div style={{ marginBottom:"12px" }}><label style={LBL}>Client *</label><input style={INP} value={form.client} onChange={function(e){setF("client",e.target.value);}} placeholder="Ex: Kwikflo, Ventia..." /></div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"12px" }}>
          <div><label style={LBL}>Day</label><select style={INP} value={form.day} onChange={function(e){setF("day",e.target.value);}}>{DAYS.map(function(d){return <option key={d}>{d}</option>;})}</select></div>
          <div><label style={LBL}>Date</label><input style={INP} type="date" value={form.date} onChange={function(e){setF("date",e.target.value);}} /></div>
          <div><label style={LBL}>Time on site</label><select style={INP} value={form.time} onChange={function(e){setF("time",e.target.value);}}><option value="">Select...</option>{TIMES.map(function(t){return <option key={t}>{t}</option>;})}</select></div>
          <div><label style={LBL}>Status</label><select style={INP} value={form.status} onChange={function(e){setF("status",e.target.value);}}>{STATUSES.map(function(s){return <option key={s}>{s}</option>;})}</select></div>
        </div>
        <div style={{ marginBottom:"12px" }}><label style={LBL}>Address</label><input style={INP} value={form.address} onChange={function(e){setF("address",e.target.value);}} placeholder="Ex: 2 Wilson St Chatswood" /></div>
        <div style={{ marginBottom:"12px" }}><label style={LBL}>Work Order Ref</label><input style={INP} value={form.workOrderRef} onChange={function(e){setF("workOrderRef",e.target.value);}} placeholder="Ex: WOR201300821144" /></div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"12px" }}>
          <div><label style={LBL}>Team Leader (1st Ute)</label><select style={INP} value={form.teamLeader} onChange={function(e){setF("teamLeader",e.target.value);}}><option value="">Select...</option>{tls.map(function(n){var b=busy[n]&&form.teamLeader!==n;return <option key={n} value={n} disabled={!!b}>{b?n+" (busy)":n}</option>;})}</select></div>
          <div><label style={LBL}>2nd Ute</label><select style={INP} value={form.ute2||""} onChange={function(e){setF("ute2",e.target.value);}}><option value="">None</option>{tls.map(function(n){var b=busy[n]&&form.ute2!==n;return <option key={n} value={n} disabled={!!b}>{b?n+" (busy)":n}</option>;})}</select></div>
          <div><label style={LBL}>3rd Ute</label><select style={INP} value={form.ute3||""} onChange={function(e){setF("ute3",e.target.value);}}><option value="">None</option>{tls.map(function(n){var b=busy[n]&&form.ute3!==n;return <option key={n} value={n} disabled={!!b}>{b?n+" (busy)":n}</option>;})}</select></div>
          <div><label style={LBL}>Nr Utes</label><input style={INP} type="number" min="1" value={form.uteCount} onChange={function(e){setF("uteCount",Number(e.target.value));}} /></div>
        </div>
        <div style={{ marginBottom:"12px" }}>
          <label style={LBL}>TCs on crew {Object.keys(busy).length>0?"• strikethrough = busy":""}</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"6px", marginTop:"6px" }}>
            {tcs.map(function(name){var sel=workers.indexOf(name)>=0,isBusy=!sel&&!!busy[name];return <div key={name} onClick={function(){if(!isBusy)toggleW(name);}} style={{ padding:"5px 12px", borderRadius:"20px", fontSize:"12px", cursor:isBusy?"default":"pointer", background:sel?"#166534":isBusy?"#f1f5f9":"#f0fdf4", color:sel?"#fff":isBusy?"#cbd5e1":"#166534", border:"1px solid "+(sel?"#166534":isBusy?"#e2e8f0":"#bbf7d0"), userSelect:"none", textDecoration:isBusy?"line-through":"none", opacity:isBusy?0.5:1 }}>{name}</div>;})}
          </div>
          <div style={{ color:"#64748b", fontSize:"11px", marginTop:"6px" }}>{workers.length} TCs selected</div>
        </div>
        <div style={{ marginBottom:"16px" }}><label style={LBL}>Notes</label><textarea style={{ width:"100%", background:"#f8fafc", border:"1px solid #cbd5e1", borderRadius:"6px", color:"#1a2e1a", padding:"8px 10px", fontSize:"13px", outline:"none", boxSizing:"border-box", minHeight:"60px", resize:"vertical" }} value={form.notes} onChange={function(e){setF("notes",e.target.value);}} placeholder="Ex: $120 travel paid..." /></div>
        <div style={{ display:"flex", gap:"10px" }}>
          <button onClick={props.onClose} style={{ flex:1, background:"#f1f5f9", border:"1px solid #cbd5e1", color:"#64748b", borderRadius:"6px", padding:"12px", fontSize:"13px", cursor:"pointer" }}>Cancel</button>
          <button onClick={doSave} disabled={saving} style={{ flex:2, background:"linear-gradient(135deg,#166534,#14532d)", border:"none", color:"#fff", borderRadius:"6px", padding:"12px", fontSize:"13px", cursor:"pointer", fontWeight:"700", opacity:saving?0.7:1 }}>{saving?"Saving...":"Save Job"}</button>
        </div>
      </div>
    </div>
  );
}

function JobCard(props) {
  var job=props.job, sc=STATUS_COLORS[job.status]||STATUS_COLORS.Pending;
  var workers=Array.isArray(job.workers)?job.workers:[];
  var utes=[job.teamLeader,job.ute2,job.ute3].filter(Boolean);
  var mapsUrl="https://maps.google.com/?q="+encodeURIComponent(job.address||"");
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
  var jobs=props.jobs, year=props.year, month=props.month;
  var days=getMonthDays(year,month), todayStr=formatDate(new Date()), byDate={};
  jobs.forEach(function(j){if(j.date){if(!byDate[j.date])byDate[j.date]=[];byDate[j.date].push(j);}});
  return (
    <div style={{ padding:"12px" }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", background:"#166534", borderRadius:"8px 8px 0 0" }}>
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(function(d){return <div key={d} style={{ padding:"10px 4px", textAlign:"center", fontSize:"11px", fontWeight:"700", color:"#fff", fontFamily:"monospace" }}>{d}</div>;})}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", border:"1px solid #e2e8f0", borderTop:"none", borderRadius:"0 0 8px 8px", overflow:"hidden" }}>
        {days.map(function(day,idx){
          var ds=formatDate(day.date), dj=byDate[ds]||[], isToday=ds===todayStr;
          var dowName=DAYS[day.date.getDay()===0?6:day.date.getDay()-1];
          return (
            <div key={idx} style={{ minHeight:"110px", borderRight:"1px solid #e2e8f0", borderBottom:"1px solid #e2e8f0", background:day.current?"#fff":"#f8fafc", padding:"6px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"4px" }}>
                <span style={{ width:"24px", height:"24px", borderRadius:"50%", background:isToday?"#166534":"transparent", color:isToday?"#fff":day.current?"#1a2e1a":"#cbd5e1", fontSize:"12px", fontWeight:isToday?"700":"500", display:"flex", alignItems:"center", justifyContent:"center" }}>{day.date.getDate()}</span>
                {day.current?<span onClick={function(){props.onAdd(ds,dowName);}} style={{ color:"#22c55e", fontSize:"18px", cursor:"pointer", lineHeight:1 }}>+</span>:null}
              </div>
              {dj.slice(0,3).map(function(job){var sc=STATUS_COLORS[job.status]||STATUS_COLORS.Pending;return <div key={job.id} onClick={function(){props.onEdit(job);}} style={{ background:sc.bg, borderLeft:"3px solid "+sc.border, borderRadius:"3px", padding:"2px 5px", marginBottom:"3px", cursor:"pointer", fontSize:"10px", color:sc.text, fontWeight:"600", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job.time?" "+job.time+" ":""}{job.client}</div>;})}
              {dj.length>3?<div style={{ fontSize:"9px", color:"#94a3b8" }}>+{dj.length-3} more</div>:null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView(props) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:"8px", padding:"12px" }}>
      {DAYS.map(function(day){
        var dj=props.jobs.filter(function(j){return j.day===day;});
        var count=dj.filter(function(j){return j.status!=="Cancelled";}).length;
        return (
          <div key={day} style={{ background:"#fff", borderRadius:"8px", border:"1px solid #bbf7d0", minHeight:"180px", overflow:"hidden" }}>
            <div style={{ background:"#166534", padding:"8px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ color:"#fff", fontSize:"11px", fontWeight:"700", fontFamily:"monospace" }}>{day.slice(0,3).toUpperCase()}</span>
              {count>0?<span style={{ background:"rgba(255,255,255,0.3)", color:"#fff", borderRadius:"10px", fontSize:"10px", fontWeight:"700", padding:"1px 6px" }}>{count}</span>:null}
            </div>
            <div style={{ padding:"6px" }}>
              {dj.map(function(job){var sc=STATUS_COLORS[job.status]||STATUS_COLORS.Pending;return <div key={job.id} onClick={function(){props.onEdit(job);}} style={{ background:sc.bg, borderLeft:"3px solid "+sc.border, borderRadius:"4px", padding:"4px 6px", marginBottom:"4px", cursor:"pointer" }}><div style={{ color:sc.text, fontWeight:"700", fontSize:"11px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job.client}</div><div style={{ color:"#64748b", fontSize:"10px" }}>{job.time}</div></div>;})}
              <div onClick={function(){props.onAdd(null,day);}} style={{ color:"#22c55e", fontSize:"22px", textAlign:"center", cursor:"pointer", marginTop:"4px" }}>+</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DriveSection(props) {
  var s=props.section;
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"60px 20px" }}>
      <div style={{ background:"#fff", borderRadius:"16px", padding:"40px", maxWidth:"440px", width:"100%", border:"1px solid #bbf7d0", boxShadow:"0 2px 12px rgba(0,0,0,0.06)", textAlign:"center" }}>
        <div style={{ fontSize:"56px", marginBottom:"16px" }}>{s.icon}</div>
        <h2 style={{ color:"#166534", fontFamily:"monospace", fontSize:"20px", fontWeight:"700", margin:"0 0 8px 0" }}>{s.title}</h2>
        <p style={{ color:"#64748b", fontSize:"13px", marginBottom:"24px", lineHeight:1.6 }}>This section links to your Google Drive folder.</p>
        {s.link?(<a href={s.link} target="_blank" rel="noreferrer" style={{ display:"inline-flex", alignItems:"center", gap:"8px", background:"linear-gradient(135deg,#166534,#14532d)", color:"#fff", borderRadius:"8px", padding:"12px 24px", fontSize:"14px", fontWeight:"700", textDecoration:"none" }}>📂 Open in Google Drive</a>):(
          <div style={{ background:"#f0fdf4", border:"2px dashed #bbf7d0", borderRadius:"10px", padding:"20px" }}>
            <p style={{ color:"#94a3b8", fontSize:"12px", margin:"0 0 4px 0" }}>No Drive folder linked yet.</p>
            <p style={{ color:"#166534", fontSize:"12px", fontWeight:"600", margin:0 }}>Create the folder and we'll link it here!</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────
export default function App() {
  var s1=useState([]); var jobs=s1[0]; var setJobs=s1[1];
  var s2=useState([]); var workers=s2[0]; var setWorkers=s2[1];
  var s3=useState("Monday"); var activeDay=s3[0]; var setActiveDay=s3[1];
  var s4=useState(null); var editingJob=s4[0]; var setEditingJob=s4[1];
  var s5=useState(null); var editingWorker=s5[0]; var setEditingWorker=s5[1];
  var s6=useState(true); var loading=s6[0]; var setLoading=s6[1];
  var s7=useState("bookings"); var tab=s7[0]; var setTab=s7[1];
  var s8=useState("month"); var viewMode=s8[0]; var setViewMode=s8[1];
  var now=new Date();
  var s9=useState(now.getFullYear()); var calYear=s9[0]; var setCalYear=s9[1];
  var s10=useState(now.getMonth()); var calMonth=s10[0]; var setCalMonth=s10[1];

  useEffect(function(){
    // No orderBy to avoid index issues — sort in code
    var unsub=onSnapshot(collection(db,"jobs"),function(snap){
      var list=snap.docs.map(function(d){return Object.assign({id:d.id},d.data());});
      list.sort(function(a,b){return (a.date||"").localeCompare(b.date||"");});
      setJobs(list);
      setLoading(false);
    });
    return unsub;
  },[]);

  useEffect(function(){
    var unsub=onSnapshot(collection(db,"workers"),function(snap){
      var list=snap.docs.map(function(d){return Object.assign({id:d.id},d.data());});
      list.sort(function(a,b){return (a.name||"").localeCompare(b.name||"");});
      setWorkers(list);
    });
    return unsub;
  },[]);

  // Always have team lists — merge Firebase workers with defaults
  var tlFromDB=workers.filter(function(w){return w.status!=="Inactive"&&getWorkerRoles(w).indexOf("Team Leader")>=0;}).map(function(w){return w.name;});
  var tcFromDB=workers.filter(function(w){return w.status!=="Inactive";}).map(function(w){return w.name;});
  var tlNames=tlFromDB.length>0?tlFromDB:DEFAULT_TLS;
  var tcNames=tcFromDB.length>0?tcFromDB:DEFAULT_TCS;

  function saveJob(form){
    if(form.id){var id=form.id;var data=Object.assign({},form);delete data.id;updateDoc(doc(db,"jobs",id),data).then(function(){setEditingJob(null);}).catch(function(e){alert("Error saving: "+e.message);});}
    else{addDoc(collection(db,"jobs"),form).then(function(){setEditingJob(null);}).catch(function(e){alert("Error saving: "+e.message);});}
  }
  function deleteJob(id){if(window.confirm("Delete this job?"))deleteDoc(doc(db,"jobs",id));}
  function toggle(id,field){var job=jobs.find(function(j){return j.id===id;});var u={};u[field]=!job[field];updateDoc(doc(db,"jobs",id),u);}
  function openNewJob(dateStr,dayName){var j=Object.assign({},emptyJob);if(dateStr)j.date=dateStr;j.day=dayName||activeDay;setEditingJob(j);}
  function prevMonth(){if(calMonth===0){setCalMonth(11);setCalYear(calYear-1);}else setCalMonth(calMonth-1);}
  function nextMonth(){if(calMonth===11){setCalMonth(0);setCalYear(calYear+1);}else setCalMonth(calMonth+1);}
  function saveWorker(form){
    if(form.id){var id=form.id;var data=Object.assign({},form);delete data.id;updateDoc(doc(db,"workers",id),data).then(function(){setEditingWorker(null);}).catch(function(e){alert("Error: "+e.message);});}
    else{addDoc(collection(db,"workers"),form).then(function(){setEditingWorker(null);}).catch(function(e){alert("Error: "+e.message);});}
  }
  function deleteWorker(id){if(window.confirm("Delete this worker?")){deleteDoc(doc(db,"workers",id));setEditingWorker(null);}}

  var dayJobs=jobs.filter(function(j){return j.day===activeDay;});
  function countActive(d){return jobs.filter(function(j){return j.day===d&&j.status!=="Cancelled";}).length;}
  var currentSection=DRIVE_SECTIONS.find(function(s){return s.id===tab;});

  return (
    <div style={{ display:"flex", height:"100vh", fontFamily:"Inter,sans-serif", background:"#f0fdf4", overflow:"hidden" }}>
      {/* Sidebar */}
      <div style={{ width:"68px", minWidth:"68px", background:"linear-gradient(180deg,#166534,#14532d)", display:"flex", flexDirection:"column", alignItems:"center", padding:"12px 0", zIndex:20, boxShadow:"2px 0 8px rgba(0,0,0,0.15)", overflowY:"auto" }}>
        <div style={{ color:"#fff", fontFamily:"monospace", fontSize:"9px", fontWeight:"700", letterSpacing:"2px", marginBottom:"16px", textAlign:"center" }}>PTM</div>
        {[{id:"bookings",icon:"📅",label:"JOBS"},{id:"team",icon:"👷",label:"TEAM"}].map(function(item){return <button key={item.id} onClick={function(){setTab(item.id);}} style={{ width:"48px", height:"48px", borderRadius:"12px", border:"none", background:tab===item.id?"rgba(255,255,255,0.25)":"transparent", cursor:"pointer", marginBottom:"6px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}><span style={{ fontSize:"20px" }}>{item.icon}</span><span style={{ color:"#bbf7d0", fontSize:"8px", marginTop:"2px", fontWeight:"700" }}>{item.label}</span></button>;})}
        <div style={{ width:"36px", height:"1px", background:"rgba(255,255,255,0.2)", margin:"8px 0" }}></div>
        {DRIVE_SECTIONS.map(function(item){return <button key={item.id} onClick={function(){setTab(item.id);}} style={{ width:"48px", height:"48px", borderRadius:"12px", border:"none", background:tab===item.id?"rgba(255,255,255,0.25)":"transparent", cursor:"pointer", marginBottom:"4px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}><span style={{ fontSize:"18px" }}>{item.icon}</span><span style={{ color:"#bbf7d0", fontSize:"7px", marginTop:"2px", fontWeight:"700" }}>{item.label}</span></button>;})}
      </div>

      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Topbar */}
        <div style={{ background:"#fff", borderBottom:"1px solid #e2e8f0", padding:"10px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0, boxShadow:"0 1px 4px rgba(0,0,0,0.06)", zIndex:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
            <h1 style={{ margin:0, color:"#166534", fontSize:"16px", fontFamily:"monospace", fontWeight:"700" }}>{tab==="team"?"Team":currentSection?currentSection.title:"Bookings"}</h1>
            {tab==="bookings"&&viewMode==="month"?(
              <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                <button onClick={prevMonth} style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", color:"#166534", borderRadius:"6px", padding:"4px 10px", fontSize:"16px", cursor:"pointer" }}>‹</button>
                <span style={{ color:"#374151", fontSize:"14px", fontWeight:"600", minWidth:"150px", textAlign:"center" }}>{MONTHS[calMonth]} {calYear}</span>
                <button onClick={nextMonth} style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", color:"#166534", borderRadius:"6px", padding:"4px 10px", fontSize:"16px", cursor:"pointer" }}>›</button>
                <button onClick={function(){setCalYear(now.getFullYear());setCalMonth(now.getMonth());}} style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", color:"#166534", borderRadius:"6px", padding:"4px 10px", fontSize:"12px", cursor:"pointer" }}>Today</button>
              </div>
            ):null}
          </div>
          <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
            {tab==="bookings"?(
              <div style={{ display:"flex", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:"8px", overflow:"hidden" }}>
                {["month","week","list"].map(function(v){var ls={month:"Month",week:"Week",list:"List"};return <button key={v} onClick={function(){setViewMode(v);}} style={{ background:viewMode===v?"#166534":"transparent", border:"none", color:viewMode===v?"#fff":"#166534", padding:"7px 14px", fontSize:"12px", fontWeight:"600", cursor:"pointer" }}>{ls[v]}</button>;}) }
              </div>
            ):null}
            {tab==="bookings"?<button onClick={function(){openNewJob(null,null);}} style={{ background:"linear-gradient(135deg,#166534,#14532d)", border:"none", color:"#fff", borderRadius:"8px", padding:"8px 16px", fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>+ New Job</button>:null}
            {tab==="team"?<button onClick={function(){setEditingWorker(Object.assign({},emptyWorker));}} style={{ background:"linear-gradient(135deg,#166534,#14532d)", border:"none", color:"#fff", borderRadius:"8px", padding:"8px 16px", fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>+ New Worker</button>:null}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:"auto" }}>
          {currentSection?(<DriveSection section={currentSection} />)
          :tab==="team"?(<TeamPage workers={workers} onEdit={function(w){setEditingWorker(w);}} />)
          :loading?(<div style={{ textAlign:"center", padding:"80px", color:"#94a3b8", fontSize:"14px" }}>Loading...</div>)
          :viewMode==="month"?(<MonthView jobs={jobs} year={calYear} month={calMonth} onEdit={function(j){setEditingJob(j);}} onAdd={openNewJob} />)
          :viewMode==="week"?(<WeekView jobs={jobs} onEdit={function(j){setEditingJob(j);}} onAdd={openNewJob} />):(
            <div>
              <div style={{ display:"flex", overflowX:"auto", background:"#fff", borderBottom:"1px solid #e2e8f0", padding:"0 8px" }}>
                {DAYS.map(function(day){var count=countActive(day),active=day===activeDay;return <button key={day} onClick={function(){setActiveDay(day);}} style={{ background:"none", border:"none", borderBottom:active?"3px solid #166534":"3px solid transparent", color:active?"#166534":"#94a3b8", padding:"10px 14px", fontSize:"12px", fontWeight:active?"700":"500", cursor:"pointer", whiteSpace:"nowrap", fontFamily:"monospace", marginBottom:"-2px" }}>{day.slice(0,3).toUpperCase()}{count>0?<span style={{ background:active?"#166534":"#e2e8f0", color:active?"#fff":"#64748b", borderRadius:"10px", fontSize:"10px", fontWeight:"700", padding:"1px 5px", marginLeft:"5px" }}>{count}</span>:null}</button>;})}
              </div>
              <div style={{ padding:"14px", maxWidth:"700px", margin:"0 auto" }}>
                {dayJobs.length===0?(
                  <div style={{ textAlign:"center", padding:"60px 20px", color:"#94a3b8" }}>
                    <div style={{ fontSize:"36px", marginBottom:"10px" }}>📋</div>
                    <div style={{ fontSize:"13px", marginBottom:"16px" }}>No jobs for {activeDay}</div>
                    <button onClick={function(){openNewJob(null,activeDay);}} style={{ background:"linear-gradient(135deg,#166534,#14532d)", border:"none", color:"#fff", borderRadius:"6px", padding:"10px 24px", fontSize:"13px", cursor:"pointer", fontWeight:"700" }}>+ Add Job</button>
                  </div>
                ):(
                  <div>
                    <div style={{ color:"#64748b", fontSize:"11px", fontFamily:"monospace", marginBottom:"10px" }}>{dayJobs.length} JOB{dayJobs.length>1?"S":""} — {activeDay.toUpperCase()}</div>
                    {dayJobs.map(function(job){return <JobCard key={job.id} job={job} onEdit={function(j){setEditingJob(j);}} onDelete={deleteJob} onToggle={toggle} />;}) }
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {editingJob?(<JobModal job={editingJob} allJobs={jobs} tls={tlNames} tcs={tcNames} onSave={saveJob} onClose={function(){setEditingJob(null);}} />):null}
      {editingWorker?(<WorkerModal worker={editingWorker} onSave={saveWorker} onDelete={deleteWorker} onClose={function(){setEditingWorker(null);}} />):null}
    </div>
  );
}
