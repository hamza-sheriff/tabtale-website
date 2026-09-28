const $ = id => document.getElementById(id);
let supabaseClient = null;
let currentUser = null;
let profiles = [];
let contactDraft = [];

function toast(msg){const t=$("toast"); if(!t)return; t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2400)}
function initials(name){return (name||"?").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()}
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function showAuth(){ $("authView").classList.remove("hidden");$("dashboardView").classList.add("hidden");$("publicView").classList.add("hidden"); }
function showDashboard(){ $("authView").classList.add("hidden");$("dashboardView").classList.remove("hidden");$("publicView").classList.add("hidden"); $("userName").textContent=currentUser?.user_metadata?.full_name||currentUser?.email||"User";$("userInitial").textContent=initials(currentUser?.user_metadata?.full_name||currentUser?.email||"User"); renderProfiles(); }
function showPublic(p){$("authView").classList.add("hidden");$("dashboardView").classList.add("hidden");$("publicView").classList.remove("hidden");renderPublic(p)}
function switchAuth(which){document.querySelectorAll(".auth-tab").forEach(b=>b.classList.toggle("active",b.dataset.auth===which));$("loginForm").classList.toggle("hidden",which!=="login");$("signupForm").classList.toggle("hidden",which!=="signup")}
document.querySelectorAll(".auth-tab").forEach(b=>b.addEventListener("click",()=>switchAuth(b.dataset.auth)));

async function initSupabase(){
  const c=window.TAPTale_CONFIG||{};
  if(!window.supabase || !c.url || c.url.includes("YOUR_") || !c.anonKey || c.anonKey.includes("YOUR_")) return false;
  supabaseClient=window.supabase.createClient(c.url,c.anonKey);
  return true;
}

async function loadProfiles(){
  if(!currentUser){profiles=[];return;}
  const {data,error}=await supabaseClient.from("profiles").select("*, contacts(*)").eq("owner_id",currentUser.id).order("created_at",{ascending:false});
  if(error){console.error(error);toast("Could not load profiles.");return}
  profiles=data||[];
}

$("signupBtn").onclick=async()=>{
  if(!supabaseClient)return toast("Supabase is not configured yet.");
  const name=$("signupName").value.trim(),email=$("signupEmail").value.trim().toLowerCase(),password=$("signupPassword").value;
  if(!name||!email||password.length<6)return toast("Please complete all fields.");
  const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{full_name:name}}});
  if(error)return toast(error.message);
  if(data.session){currentUser=data.user;toast("Account created.");showDashboard();}
  else toast("Account created. Check your email to confirm your account.");
};

$("loginBtn").onclick=async()=>{
  if(!supabaseClient)return toast("Supabase is not configured yet.");
  const email=$("loginEmail").value.trim().toLowerCase(),password=$("loginPassword").value;
  const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error)return toast("Email or password is incorrect.");
  currentUser=data.user;toast("Welcome back.");showDashboard();
};

$("logoutBtn").onclick=async()=>{if(supabaseClient)await supabaseClient.auth.signOut();currentUser=null;profiles=[];showAuth()};
$("addPersonBtn").onclick=()=>openProfileModal();$("addPersonSide").onclick=()=>openProfileModal();
function openModal(id){$(id).classList.remove("hidden")} function closeModal(id){$(id).classList.add("hidden")}
document.addEventListener("click",e=>{const id=e.target.dataset.close;if(id)closeModal(id)});

function openProfileModal(profile=null){
  $("modalTitle").textContent=profile?"Edit profile":"Add a person";$("editProfileId").value=profile?.id||"";$("personName").value=profile?.name||"";$("personAge").value=profile?.age??"";$("personRelation").value=profile?.relation||"Child";$("personNote").value=profile?.note||"";
  contactDraft=(profile?.contacts||[]).map(c=>({...c})); if(!contactDraft.length)contactDraft=[{name:"",phone:""}]; renderContactEditor();openModal("profileModal")
}
function renderContactEditor(){
  $("contactsEditor").innerHTML=contactDraft.map((c,i)=>`<div class="contact-edit"><input data-ci="${i}" data-field="name" value="${escapeHtml(c.name||"")}" placeholder="Contact name"><input data-ci="${i}" data-field="phone" value="${escapeHtml(c.phone||"")}" placeholder="Phone number"><button type="button" class="remove-contact" data-remove="${i}">×</button></div>`).join("");
  document.querySelectorAll("[data-ci]").forEach(el=>el.oninput=()=>{contactDraft[+el.dataset.ci][el.dataset.field]=el.value});
  document.querySelectorAll("[data-remove]").forEach(el=>el.onclick=()=>{contactDraft.splice(+el.dataset.remove,1);if(!contactDraft.length)contactDraft.push({name:"",phone:""});renderContactEditor()});
}
$("addContactBtn").onclick=()=>{contactDraft.push({name:"",phone:""});renderContactEditor()};

$("profileForm").onsubmit=async e=>{
  e.preventDefault();if(!supabaseClient||!currentUser)return toast("Please log in first.");
  const id=$("editProfileId").value; const cleanContacts=contactDraft.filter(c=>String(c.name||"").trim()||String(c.phone||"").trim());
  const payload={owner_id:currentUser.id,name:$("personName").value.trim(),age:$("personAge").value?Number($("personAge").value):null,relation:$("personRelation").value,note:$("personNote").value.trim()};
  if(!payload.name)return toast("Please enter the person's name.");
  let profile;
  if(id){const r=await supabaseClient.from("profiles").update(payload).eq("id",id).eq("owner_id",currentUser.id).select().single();if(r.error)return toast(r.error.message);profile=r.data;await supabaseClient.from("contacts").delete().eq("profile_id",id)}
  else{const r=await supabaseClient.from("profiles").insert(payload).select().single();if(r.error)return toast(r.error.message);profile=r.data}
  if(cleanContacts.length){const rows=cleanContacts.map(c=>({profile_id:profile.id,name:String(c.name||"").trim(),phone:String(c.phone||"").trim()}));const r=await supabaseClient.from("contacts").insert(rows);if(r.error)return toast(r.error.message)}
  closeModal("profileModal");await loadProfiles();renderProfiles();toast(id?"Profile updated.":"Profile created.");
};

function renderProfiles(){
  const list=profiles;$("profileCount").textContent=list.length;$("contactCount").textContent=list.reduce((n,p)=>n+(p.contacts?.length||0),0);$("qrCount").textContent=list.length;
  if(!list.length){$("profilesGrid").innerHTML=`<div class="empty-state"><div class="empty-icon">＋</div><h3>No profiles yet</h3><p>Create a profile for a child, elderly family member, or anyone who may benefit from quick access to trusted contact information.</p><button class="btn btn-primary" onclick="openProfileModal()">Create first profile →</button></div>`;return}
  $("profilesGrid").innerHTML=list.map(p=>`<article class="profile-card"><div class="profile-top"><div class="profile-info"><div class="person-avatar">${initials(p.name)}</div><div><h3 class="profile-name">${escapeHtml(p.name)}</h3><div class="profile-meta">${escapeHtml(p.relation||"")}${p.age!=null?" · "+escapeHtml(p.age)+" years":""}</div></div></div><button class="more-btn" onclick='openProfileModal(${JSON.stringify(p).replace(/'/g,"&#39;")})'>⋯</button></div>${p.note?`<div class="profile-note">ℹ ${escapeHtml(p.note)}</div>`:""}<div class="contact-list">${(p.contacts||[]).slice(0,3).map(c=>`<div class="contact-row"><div><strong>${escapeHtml(c.name||"Contact")}</strong><small>${escapeHtml(c.phone||"No number")}</small></div>${c.phone?`<a href="tel:${escapeHtml(c.phone)}">CALL</a>`:""}</div>`).join("")||`<div class="profile-meta">No trusted contacts added yet.</div>`}</div><div class="card-actions"><button class="btn btn-primary" onclick="openQr('${p.id}')">QR code ↗</button><button class="btn btn-secondary" onclick="openPublic('${p.id}')">View profile</button></div></article>`).join("");
}
window.openProfileModal=openProfileModal;window.openQr=openQr;window.openPublic=openPublic;
function publicUrl(id){return location.href.split("?")[0]+"?profile="+encodeURIComponent(id)}
async function openQr(id){const p=profiles.find(x=>x.id===id);if(!p)return;$("qrTitle").textContent=p.name+" · QR code";$("qrcode").innerHTML="";const url=publicUrl(id);$("profileUrl").textContent=url;new QRCode($("qrcode"),{text:url,width:160,height:160,colorDark:"#0b1220",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.H});$("downloadQrBtn").onclick=()=>{const img=$("qrcode").querySelector("img");if(!img)return;const a=document.createElement("a");a.href=img.src;a.download=`TapTale-${p.name.replace(/\s+/g,"-")}-QR.png`;a.click()};$("openProfileBtn").onclick=()=>location.href=url;openModal("qrModal")}
function openPublic(id){location.href=publicUrl(id)}

async function fetchPublicProfile(id){
  const {data,error}=await supabaseClient.rpc("get_public_profile",{p_id:id});
  if(error){console.error(error);return null} return data||null;
}
function renderPublic(p){if(!p){$("publicProfile").innerHTML=`<div class="public-person"><div class="public-avatar">?</div><h1>Profile not found</h1><p>This TapTale profile is unavailable.</p></div>`;return}$("publicProfile").innerHTML=`<div class="public-person"><div class="public-avatar">${initials(p.name)}</div><h1>${escapeHtml(p.name)}</h1><p>${escapeHtml(p.relation||"")}${p.age!=null?" · "+escapeHtml(p.age)+" years old":""}</p></div>${p.note?`<div class="alert-note"><strong>Important information</strong><br>${escapeHtml(p.note)}</div>`:""}<div class="public-contacts"><h3>Trusted family contacts</h3>${(p.contacts||[]).map(c=>`<div class="public-contact"><div><strong>${escapeHtml(c.name||"Family contact")}</strong><small>${escapeHtml(c.phone||"")}</small></div>${c.phone?`<a class="call-btn" href="tel:${escapeHtml(c.phone)}">Call</a>`:""}</div>`).join("")||"<p class='subtitle'>No contact information is available.</p>"}</div>`}

async function boot(){
  const ready=await initSupabase(); const params=new URLSearchParams(location.search),pid=params.get("profile");
  if(!ready){if(pid){showPublic(null)}else showAuth();toast("Online mode needs your Supabase setup.");return}
  const {data}=await supabaseClient.auth.getSession();currentUser=data.session?.user||null;
  supabaseClient.auth.onAuthStateChange((_event,session)=>{currentUser=session?.user||null;if(currentUser&&!pid)showDashboard();else if(!currentUser&&!pid)showAuth()});
  if(pid){showPublic(await fetchPublicProfile(pid));return}
  if(currentUser){await loadProfiles();showDashboard()}else showAuth();
}
boot();
