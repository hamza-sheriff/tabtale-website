const $ = id => document.getElementById(id);
let supabaseClient = null;
let currentUser = null;
let profiles = [];
let contactDraft = [];

let toastTimer; function toast(msg){const t=$("toast"); if(!t)return; clearTimeout(toastTimer); t.textContent=msg; t.classList.add("show"); toastTimer=setTimeout(()=>t.classList.remove("show"),2800)}
function initials(name){return (name||"?").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()}
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
let profileFilter = "";
function setButtonLoading(button, loading, text="Saving..."){
  if(!button) return;
  if(loading){ button.dataset.originalText = button.innerHTML; button.disabled=true; button.innerHTML=`${escapeHtml(text)} <span class="spinner"></span>`; }
  else { button.disabled=false; button.innerHTML=button.dataset.originalText || "Save profile <span>→</span>"; }
}
function normalizePhone(value=""){ return String(value).replace(/[^0-9+()\-\s]/g, "").trim(); }

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
  e.preventDefault();
  if(!supabaseClient||!currentUser)return toast("Please log in first.");
  const button=$("saveProfileBtn");
  const id=$("editProfileId").value;
  const name=$("personName").value.trim();
  const ageValue=$("personAge").value.trim();
  const cleanContacts=contactDraft.map(c=>({name:String(c.name||"").trim(),phone:normalizePhone(c.phone)})).filter(c=>c.name||c.phone);
  const payload={owner_id:currentUser.id,name,age:ageValue?Number(ageValue):null,relation:$("personRelation").value,note:$("personNote").value.trim()};
  if(!name)return toast("Please enter the person's name.");
  if(payload.age!==null && (!Number.isInteger(payload.age)||payload.age<0||payload.age>120))return toast("Please enter a valid age between 0 and 120.");
  if(cleanContacts.some(c=>!c.name||!c.phone))return toast("Each trusted contact needs a name and phone number.");
  setButtonLoading(button,true,id?"Updating...":"Saving...");
  try{
    let profile;
    if(id){
      const r=await supabaseClient.from("profiles").update(payload).eq("id",id).eq("owner_id",currentUser.id).select().single();
      if(r.error)throw r.error;
      profile=r.data;
      const del=await supabaseClient.from("contacts").delete().eq("profile_id",id);
      if(del.error)throw del.error;
    }else{
      const r=await supabaseClient.from("profiles").insert(payload).select().single();
      if(r.error)throw r.error;
      profile=r.data;
    }
    if(cleanContacts.length){
      const rows=cleanContacts.map(c=>({profile_id:profile.id,name:c.name,phone:c.phone}));
      const r=await supabaseClient.from("contacts").insert(rows);
      if(r.error)throw r.error;
    }
    closeModal("profileModal");
    await loadProfiles();
    renderProfiles();
    toast(id?"Profile updated successfully.":"Profile created successfully.");
  }catch(err){
    console.error(err);
    toast(err?.message || "Could not save the profile. Please try again.");
  }finally{
    setButtonLoading(button,false);
  }
};

function renderProfiles(){
  const query=profileFilter.toLowerCase();
  const list=profiles.filter(p=>!query || [p.name,p.relation,p.note,...(p.contacts||[]).flatMap(c=>[c.name,c.phone])].filter(Boolean).join(" ").toLowerCase().includes(query));
  $("profileCount").textContent=profiles.length;
  $("contactCount").textContent=profiles.reduce((n,p)=>n+(p.contacts?.length||0),0);
  $("qrCount").textContent=profiles.length;
  if(!list.length){
    $("profilesGrid").innerHTML=profiles.length?`<div class="empty-state"><div class="empty-icon">⌕</div><h3>No matching profiles</h3><p>Try another name, relationship, or contact number.</p></div>`:`<div class="empty-state"><div class="empty-icon">＋</div><h3>No profiles yet</h3><p>Create a profile for a child, elderly family member, or anyone who may benefit from quick access to trusted contact information.</p><button class="btn btn-primary" onclick="openProfileModal()">Create first profile →</button></div>`;
    return;
  }
  $("profilesGrid").innerHTML=list.map(p=>{
    const contacts=(p.contacts||[]);
    return `<article class="profile-card">
      <div class="profile-top"><div class="profile-info"><div class="person-avatar">${initials(p.name)}</div><div><h3 class="profile-name">${escapeHtml(p.name)}</h3><div class="profile-meta">${escapeHtml(p.relation||"")}${p.age!=null?" · "+escapeHtml(p.age)+" years":""}</div></div></div>
      <button class="more-btn" title="Edit profile" data-edit-profile="${p.id}">⋯</button></div>
      ${p.note?`<div class="profile-note">ℹ ${escapeHtml(p.note)}</div>`:""}
      <div class="contact-list">${contacts.slice(0,3).map(c=>`<div class="contact-row"><div><strong>${escapeHtml(c.name||"Contact")}</strong><small>${escapeHtml(c.phone||"No number")}</small></div>${c.phone?`<a href="tel:${escapeHtml(c.phone)}">CALL</a>`:""}</div>`).join("")||`<div class="profile-meta">No trusted contacts added yet.</div>`}</div>
      ${contacts.length>3?`<div class="profile-meta">+${contacts.length-3} more contact${contacts.length-3===1?"":"s"}</div>`:""}
      <div class="card-actions"><button class="btn btn-primary" data-nfc-profile="${p.id}">NFC tag</button><button class="btn btn-secondary" data-qr-profile="${p.id}">QR code ↗</button><button class="btn btn-secondary" data-public-profile="${p.id}">View profile</button><button class="btn btn-danger" data-delete-profile="${p.id}">Delete</button></div>
    </article>`;
  }).join("");
}

$("profileSearch").addEventListener("input",e=>{profileFilter=e.target.value.trim();renderProfiles()});
document.addEventListener("click",async e=>{
  const edit=e.target.closest("[data-edit-profile]");
  const nfc=e.target.closest("[data-nfc-profile]");
  const qr=e.target.closest("[data-qr-profile]");
  const share=e.target.closest("[data-share]");
  const pub=e.target.closest("[data-public-profile]");
  const del=e.target.closest("[data-delete-profile]");
  if(edit){const p=profiles.find(x=>x.id===edit.dataset.editProfile);if(p)openProfileModal(p)}
  if(nfc)openNfc(nfc.dataset.nfcProfile);
  if(share)shareLocation(share.dataset.share,share.dataset.phone);
  if(qr)openQr(qr.dataset.qrProfile);
  if(pub)openPublic(pub.dataset.publicProfile);
  if(del)await deleteProfile(del.dataset.deleteProfile,del);
});
async function deleteProfile(id,button){
  const p=profiles.find(x=>x.id===id);
  if(!p)return;
  if(!confirm(`Delete the profile for ${p.name}? This cannot be undone.`))return;
  button.disabled=true;
  const {error}=await supabaseClient.from("profiles").delete().eq("id",id).eq("owner_id",currentUser.id);
  button.disabled=false;
  if(error){console.error(error);return toast(error.message||"Could not delete profile.");}
  await loadProfiles();renderProfiles();toast("Profile deleted.");
}

window.openNfc=openNfc;window.openProfileModal=openProfileModal;window.openQr=openQr;window.openPublic=openPublic;
function openNfc(id){
  const p=profiles.find(x=>x.id===id);
  if(!p)return;
  const url=publicUrl(id);
  const ok="NDEFReader" in window;
  $("nfcTitle").textContent=(p.name||"Child")+" · NFC tag";
  $("nfcUrl").textContent=url;
  $("nfcStatus").textContent=ok?"NFC writing is available on this device/browser.":"NFC writing is not available in this browser.";
  $("nfcStatus").className="nfc-status "+(ok?"nfc-ok":"nfc-unavailable");
  $("writeNfcBtn").disabled=!ok;
  $("writeNfcBtn").onclick=async()=>{
    try{
      const writer=new NDEFReader();
      await writer.write({records:[{recordType:"url",data:url}]});
      toast("تم الكتابة على التاج بنجاح.");
    }catch(err){console.error(err);toast(err?.message||"Could not write the NFC tag.");}
  };
  $("copyNfcBtn").onclick=async()=>{try{await navigator.clipboard.writeText(url);toast("Link copied.")}catch{toast("Copy failed. Select the link manually.")}};
  openModal("nfcModal");
}
function publicUrl(id){const base=(window.TAPTale_CONFIG?.siteUrl||"").trim()||location.href.split("#")[0].split("?")[0];return base+"?profile="+encodeURIComponent(id)}
async function openQr(id){const p=profiles.find(x=>x.id===id);if(!p)return;$("qrTitle").textContent=p.name+" · QR code";$("qrcode").innerHTML="";const url=publicUrl(id);$("profileUrl").textContent=url;new QRCode($("qrcode"),{text:url,width:160,height:160,colorDark:"#0b1220",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.H});$("downloadQrBtn").onclick=()=>{const img=$("qrcode").querySelector("img");if(!img)return;const a=document.createElement("a");a.href=img.src;a.download=`TapTale-${p.name.replace(/\s+/g,"-")}-QR.png`;a.click()};$("openProfileBtn").onclick=()=>location.href=url;openModal("qrModal")}
function openPublic(id){location.href=publicUrl(id)}

async function fetchPublicProfile(id){
  const {data,error}=await supabaseClient.rpc("get_public_profile",{p_id:id});
  if(error){console.error(error);return null} return data||null;
}
let publicData=null;
function intlPhone(ph){
  let d=String(ph||"").replace(/[^\d+]/g,"");
  if(d.startsWith("+"))return d.slice(1);
  if(d.startsWith("00"))return d.slice(2);
  if(d.startsWith("0"))return (window.TAPTale_CONFIG?.defaultCountryCode||"20")+d.slice(1);
  return d;
}
function shareLocation(kind,phone){
  if(!navigator.geolocation)return toast("الموقع مش متاح على الجهاز ده. اتصل بولي الأمر مباشرة.");
  toast("جاري تحديد موقعك...");
  navigator.geolocation.getCurrentPosition(pos=>{
    const link=`https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`;
    const name=publicData?.name||"الطفل";
    const msg=`السلام عليكم، أنا لقيت ${name} وهو معايا بأمان. ده موقعي دلوقتي: ${link}`;
    location.href=kind==="wa"?`https://wa.me/${intlPhone(phone)}?text=${encodeURIComponent(msg)}`:`sms:${phone}?body=${encodeURIComponent(msg)}`;
  },()=>toast("مقدرناش نحدد الموقع. فعّل صلاحية الموقع أو اتصل بالأهل مباشرة."),{enableHighAccuracy:true,timeout:15000,maximumAge:0});
}
function renderPublic(p){
  publicData=p;
  if(!p||!p.id){$("publicProfile").innerHTML=`<div class="public-person"><div class="public-avatar">?</div><h1>Profile not found</h1><p>This TapTale profile is unavailable.</p></div>`;return}
  const contacts=(p.contacts||[]).filter(c=>c.phone);
  const first=contacts[0];
  $("publicProfile").innerHTML=`
    <div class="lost-banner"><strong>لو لقيت الطفل ده تايه، كلّم أهله دلوقتي 🙏</strong><span>If you found this child, please contact the family now.</span></div>
    <div class="public-person"><div class="public-avatar">${initials(p.name)}</div><h1>${escapeHtml(p.name)}</h1><p>${escapeHtml(p.relation||"")}${p.age!=null?" · "+escapeHtml(p.age)+" سنة / years old":""}</p></div>
    ${p.note?`<div class="alert-note"><strong>معلومات مهمة / Important information</strong><br>${escapeHtml(p.note)}</div>`:""}
    <div class="public-contacts"><h3>اتصل بالأهل / Call family</h3>${contacts.map(c=>`<div class="public-contact"><div><strong>${escapeHtml(c.name||"Family contact")}</strong><small>${escapeHtml(c.phone)}</small></div><a class="call-btn" href="tel:${escapeHtml(c.phone)}">اتصل / Call</a></div>`).join("")||"<p class='subtitle'>No contact information is available.</p>"}</div>
    ${first?`<div class="share-loc"><h3>ابعت موقعك للأهل / Send your location</h3><div class="share-row"><button class="btn btn-primary" data-share="wa" data-phone="${escapeHtml(first.phone)}">WhatsApp 📍</button><button class="btn btn-secondary" data-share="sms" data-phone="${escapeHtml(first.phone)}">SMS 📍</button></div><small>هيتبعت لـ ${escapeHtml(first.name||"ولي الأمر")}</small></div>`:""}`;
}

document.addEventListener("keydown",e=>{if(e.key==="Escape"){["profileModal","qrModal","nfcModal"].forEach(id=>$(id)?.classList.add("hidden"));}});

async function boot(){
  const ready=await initSupabase(); const params=new URLSearchParams(location.search),pid=params.get("profile");
  if(pid){
    showPublic(null); $("publicProfile").innerHTML='<div class="public-person"><div class="public-avatar">…</div><h1>جاري التحميل...</h1><p>Loading profile</p></div>';
    if(!ready){renderPublic(null);return}
    renderPublic(await fetchPublicProfile(pid));return;
  }
  if(!ready){showAuth();toast("Online mode needs your Supabase setup.");return}
  const {data}=await supabaseClient.auth.getSession();currentUser=data.session?.user||null;
  supabaseClient.auth.onAuthStateChange((_event,session)=>{currentUser=session?.user||null;if(currentUser&&!pid)showDashboard();else if(!currentUser&&!pid)showAuth()});
  if(currentUser){await loadProfiles();showDashboard()}else showAuth();
}
boot();
