(async function () {

const {createClient}=window.supabase;
const SUPABASE_URL='https://podzzorjsvhsdiqistpd.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_8_E2DXr76Qq-NaOrVwc7_w_vSFngK3E';
const status=document.getElementById('authStatus');
const syncStatus=document.getElementById('syncStatus');
const configured=SUPABASE_URL.startsWith('https://')&&!SUPABASE_URL.includes('REPLACE_')&&!SUPABASE_ANON_KEY.includes('REPLACE_');
if(!configured){
  status.textContent='Setup required: configure your Supabase project URL and publishable key.';
}else{
 const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
 let currentUser=null, dirty=false, saveTimer=null, generation=0, inFlight=null, loadingUserId=null, baseRevision=null, saveConflict=false, recoveryWorkspace=null, saveBlocked=false;
 const empty=()=>({transactions:[],budgets:{},goals:[],recurring:[]});
 const safeState=v=>{try{validateFinanceBackup(v);return true}catch{return false}};
 // Each tab keeps its own recovery draft so another tab cannot erase it.
 let draftId;try{draftId=sessionStorage.getItem('veydravo-draft-id');if(!draftId){draftId=crypto.randomUUID();sessionStorage.setItem('veydravo-draft-id',draftId)}}catch{draftId=crypto.randomUUID()}
 const pendingKey=uid=>'veltrix-pending:'+uid+':'+draftId;
 const legacyPendingKey=uid=>'veltrix-pending:'+uid;
 const showError=e=>{syncStatus.textContent='Not saved to cloud. '+(e?.message||'Please retry when online.');};
 function rememberPending(){try{localStorage.setItem(pendingKey(currentUser.id),JSON.stringify({format:'veydravo-draft-v1',baseRevision,data:state}));return true}catch(e){showError(new Error('Keep this page open until cloud saving finishes.'));return false}}
 function blockConflictingSave(){
  saveConflict=true;dirty=true;clearTimeout(saveTimer);const remembered=rememberPending();
  document.getElementById('saveConflict').hidden=false;
  syncStatus.textContent=remembered?'Saving paused: a newer version exists. Your edits are kept on this device.':'Saving paused: a newer version exists and a local copy could not be saved. Keep this page open and download your edits.';
 }
 async function flush(){
   if(inFlight){await inFlight;if(dirty)return flush();return !dirty}
   if(saveConflict||saveBlocked)return false;
   if(!currentUser||!dirty)return true;
   const uid=currentUser.id,gen=generation,expectedRevision=baseRevision;let payload;
   try{payload=validateFinanceBackup(state)}catch(error){
    saveBlocked=true;dirty=true;rememberPending();showError(error);
    document.getElementById('saveProblem').hidden=false;document.getElementById('saveProblemMessage').textContent=error.message;return false;
   }
   dirty=false;
   syncStatus.textContent='Saving…';
   inFlight=(async()=>{
    try{
     const request=expectedRevision===null
      ?supabase.from('finance_data').insert({user_id:uid,data:payload,revision:0}).select('revision').maybeSingle()
      :supabase.from('finance_data').update({data:payload,revision:expectedRevision+1}).eq('user_id',uid).eq('revision',expectedRevision).select('revision').maybeSingle();
     const {data:saved,error}=await request;
     if(gen!==generation)return false;
     if(error){if(['23505','40001'].includes(error.code)){blockConflictingSave();return false}throw error}
     if(!saved||!Number.isInteger(saved.revision)){blockConflictingSave();return false}
     baseRevision=saved.revision;
     if(dirty)rememberPending();
     if(!dirty){try{localStorage.removeItem(pendingKey(uid))}catch{}syncStatus.textContent='All changes saved';}
     return true;
    }catch(e){if(gen===generation){dirty=true;showError(e)}return false;}
   })();
   const ok=await inFlight;inFlight=null;
   if(dirty&&!saveConflict&&!saveBlocked&&gen===generation){clearTimeout(saveTimer);saveTimer=setTimeout(flush,ok?0:3000)}
   return ok;
 }
 function queueSave(){if(!currentUser)return;dirty=true;saveBlocked=false;document.getElementById('saveProblem').hidden=true;const remembered=rememberPending();if(saveConflict){blockConflictingSave();return;}syncStatus.textContent=remembered?'Changes waiting to save…':'Saving to cloud; local recovery is unavailable. Keep this page open.';clearTimeout(saveTimer);saveTimer=setTimeout(flush,550);}
 save=function(){queueSave();render();render2();};
 async function loadUser(user,{discardPending=false}={}){
   if(loadingUserId===user.id)return;loadingUserId=user.id;
   const gen=++generation;clearTimeout(saveTimer);currentUser=user;dirty=false;saveConflict=false;saveBlocked=false;recoveryWorkspace=null;document.getElementById('workspaceRecovery').hidden=true;document.getElementById('saveProblem').hidden=true;document.getElementById('saveConflict').hidden=true;
   document.body.classList.remove('cloud-ready');status.textContent='Loading your private workspace…';
   try{
     const {data,error}=await supabase.from('finance_data').select('data,revision').eq('user_id',user.id).maybeSingle();
     if(gen!==generation)return;if(error)throw error;
     if(data?.data){
      try{validateFinanceBackup(data.data)}catch(error){
       recoveryWorkspace={user,data:data.data,revision:data.revision};document.getElementById('workspaceRecovery').hidden=false;
       throw new Error('Your saved workspace needs recovery: '+error.message+' Download a copy below, then restore a valid backup. The saved data has not been changed.');
      }
     }
     if(data&&!Number.isInteger(data.revision))throw new Error('Please refresh this page to load the latest saving support.');
     baseRevision=data?data.revision:null;
     state=data?.data?validateFinanceBackup(data.data):empty();
     let pending=null,pendingSource=pendingKey(user.id),rawPending=null,pendingReadError=null;try{
      let raw=localStorage.getItem(pendingSource);
      if(raw===null){pendingSource=legacyPendingKey(user.id);raw=localStorage.getItem(pendingSource)}
      rawPending=raw;pending=JSON.parse(raw);
     }catch(error){pendingReadError=error}
     if(pendingReadError&&!discardPending){recoveryWorkspace={user,data:rawPending,revision:baseRevision,draftOnly:true};document.getElementById('workspaceRecovery').hidden=false;throw new Error('An unreadable local draft needs recovery. Download it below before loading the saved cloud version.');}
     const versioned=pending?.format==='veydravo-draft-v1',draft=versioned?pending.data:pending;
     if(discardPending){try{localStorage.removeItem(pendingSource)}catch{}}
     else if(safeState(draft)&&confirm('Restore unsaved changes from this device? Cancel discards that draft and loads the cloud version.')){
      state=validateFinanceBackup(draft);dirty=true;
      if(!versioned||pending.baseRevision!==baseRevision){baseRevision=versioned?pending.baseRevision:-1;blockConflictingSave();}
     }else if(pending){
      if(!safeState(draft)&&!discardPending){
       recoveryWorkspace={user,data:draft,revision:baseRevision,draftOnly:true};document.getElementById('workspaceRecovery').hidden=false;
       throw new Error('An unsaved draft needs recovery. Download it below before choosing to use the saved cloud version.');
      }
      try{localStorage.removeItem(pendingSource)}catch{}
     }
     cancelTransactionEdit();render();render2();switchTab('overview');document.body.classList.add('cloud-ready');syncStatus.textContent=saveConflict?'Saving paused: newer cloud changes need review.':'All changes saved';status.textContent='';if(dirty&&!saveConflict)queueSave();
   }catch(e){if(gen===generation){status.textContent='Could not load your cloud data: '+e.message;currentUser=null;}}
   finally{if(loadingUserId===user.id)loadingUserId=null;}
 }
 async function logout(){
   clearTimeout(saveTimer);const button=document.getElementById('signOutBtn');button.disabled=true;
   try{
    if((dirty||inFlight)&&!await flush()){showError(new Error('Please wait for your changes to save before signing out.'));return;}
    if(dirty&&!await flush())return;
    const {error}=await supabase.auth.signOut();if(error){showError(error);return;}
    generation++;currentUser=null;baseRevision=null;saveConflict=false;document.getElementById('saveConflict').hidden=true;state=empty();cancelTransactionEdit();render();render2();document.body.classList.remove('cloud-ready');location.assign(new URL('../',location.href).href);
   }finally{button.disabled=false;}
 }
 document.getElementById('downloadConflictDraft').onclick=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download='VEYDRAVO-unsaved-edits.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 document.getElementById('loadLatestWorkspace').onclick=async()=>{
  if(!currentUser)return;
  if(!confirm('Load the latest cloud version and discard unsaved edits on this device? Download them first if you want to keep a copy.'))return;
  const button=document.getElementById('loadLatestWorkspace');button.disabled=true;
  try{if(inFlight)await inFlight;await loadUser(currentUser,{discardPending:true});}finally{button.disabled=false}
 };
 document.getElementById('downloadBlockedSave').onclick=()=>downloadWorkspace(state,'VEYDRAVO-unsaved-workspace.json');
 document.getElementById('downloadRecoveryData').onclick=()=>{if(recoveryWorkspace)downloadWorkspace(recoveryWorkspace.data,'VEYDRAVO-workspace-recovery.json')};
 document.getElementById('chooseRecoveryBackup').onclick=()=>document.getElementById('recoveryBackupFile').click();
 document.getElementById('useCloudAfterDraftError').onclick=async()=>{
  const recovery=recoveryWorkspace,message=document.getElementById('workspaceRecoveryStatus');
  if(!recovery?.draftOnly){message.textContent='The saved cloud data needs a valid backup. Download it first, then choose Restore a valid backup.';return}
  if(!confirm('Discard the invalid local draft and load the last saved cloud version? Download a copy first if you want to keep it.'))return;
  await loadUser(recovery.user,{discardPending:true});
 };
 document.getElementById('recoveryBackupFile').onchange=async event=>{
  const input=event.target,file=input.files?.[0],recovery=recoveryWorkspace,message=document.getElementById('workspaceRecoveryStatus');
  if(!file||!recovery)return;
  try{
   if(file.size>10*1024*1024)throw new Error('Choose a backup file smaller than 10 MB.');
   const candidate=validateFinanceBackup(JSON.parse(await file.text()));
   if(recoveryWorkspace!==recovery)throw new Error('The workspace changed. Choose the backup again.');
   const {data:auth,error:authError}=await supabase.auth.getUser();if(authError||auth.user?.id!==recovery.user.id)throw new Error('Sign in again before restoring this workspace.');
   if(!confirm('Replace the saved workspace with this valid backup? Download the recovery copy first.'))return;
   const request=recovery.revision===null
    ?supabase.from('finance_data').insert({user_id:recovery.user.id,data:candidate,revision:0}).select('revision').maybeSingle()
    :supabase.from('finance_data').update({data:candidate,revision:recovery.revision+1}).eq('user_id',recovery.user.id).eq('revision',recovery.revision).select('revision').maybeSingle();
   const {data:saved,error}=await request;if(error)throw error;if(!saved)throw new Error('Newer changes were saved elsewhere. Reload before restoring.');
   await loadUser(recovery.user,{discardPending:true});
  }catch(error){message.textContent='Recovery did not finish: '+(error instanceof SyntaxError?'The backup is not valid JSON.':error.message)}
  finally{input.value=''}
 };
 window.addEventListener('online',()=>{if(dirty)flush()});
 window.addEventListener('beforeunload',e=>{if(dirty||inFlight){e.preventDefault();e.returnValue='';}});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dirty)flush()});
 document.getElementById('signOutBtn').onclick=logout;
 const emailInput=document.getElementById('email');
 const passwordInput=document.getElementById('password');
 const form=document.getElementById('authForm');
 const signInButton=form.querySelector('button[type="submit"]');
 const registerButton=document.getElementById('registerBtn');
 const resetButton=document.getElementById('resetBtn');
 const validEmail=()=>emailInput.value.trim()&&emailInput.checkValidity();
 const validCredentials=()=>{
   if(!validEmail()){status.textContent='Enter a valid email address.';emailInput.focus();return false;}
   if(passwordInput.value.length<8){status.textContent='Password must be at least 8 characters.';passwordInput.focus();return false;}
   return true;
 };
 const setBusy=busy=>{signInButton.disabled=registerButton.disabled=resetButton.disabled=busy;};
 form.onsubmit=async e=>{
   e.preventDefault();if(!validCredentials())return;
   setBusy(true);status.textContent='Signing in…';
   try{
     const {data,error}=await supabase.auth.signInWithPassword({email:emailInput.value.trim(),password:passwordInput.value});
     if(error)throw error;
     if(data.user)location.assign(new URL('../',location.href).href);
   }catch(e){status.textContent=e.message==='Invalid login credentials'?'Email and password were not accepted. Use your signup email, or choose Send password reset.':e.message;}
   finally{setBusy(false);}
 };
 registerButton.onclick=async()=>{
   if(!validCredentials())return;
   setBusy(true);status.textContent='Creating account…';
   try{
     const {data,error}=await supabase.auth.signUp({email:emailInput.value.trim(),password:passwordInput.value,options:{emailRedirectTo:location.origin+location.pathname}});
     if(error)throw error;
     if(data.session&&data.user){location.assign(new URL('../',location.href).href);return;}
     status.textContent='Account request received. Check your email, including spam, and open the confirmation link. Then return here to sign in.';
   }catch(e){status.textContent='Account creation failed: '+e.message;}
   finally{setBusy(false);}
 };
 resetButton.onclick=()=>location.assign('https://veltrix-finance.onrender.com/?recover=1');
 supabase.auth.onAuthStateChange((event,session)=>{
   if(event==='PASSWORD_RECOVERY')location.replace(new URL('../?update-password=1',location.href).href);
 });
 supabase.auth.onAuthStateChange((event,session)=>{
   // Defer DB access outside auth callback.
   setTimeout(()=>{
     if(session?.user&&session.user.id!==currentUser?.id)loadUser(session.user);
     if(!session?.user&&currentUser){generation++;currentUser=null;state=empty();render();render2();document.body.classList.remove('cloud-ready');}
   },0);
 });
 const {data:{session}}=await supabase.auth.getSession();
 if(session?.user)await loadUser(session.user);else location.replace(new URL('../?signin=1',location.href).href);
}

})().catch(function (error) {
 console.error("Account startup failed", error);
 window.VeydravoCompat.accountFailure();
});
