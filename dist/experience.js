'use strict';
(() => {
 const $=s=>document.querySelector(s);
 const contact=$('#contact');contact.before($('#planner'),$('#reviews'));
 const nav=document.createElement('a');nav.href='#reviews';nav.className='nav-link';nav.textContent='Reviews';$('#navigation').insertBefore(nav,$('#navigation .mobile-contact'));
 // Use the shared CSS artwork animation on every browser; no WebGL replacement.
 const quick=document.createElement('a');quick.className='hero-planner-link';quick.href='#planner';quick.textContent='Build your project brief';$('.hero-content').append(quick);

 const base=window.CLOUD_NEST_API_ORIGIN||location.origin;
 const preview=new URLSearchParams(location.search).get('preview')==='admin';
 if(preview){$('#review-form [type=submit]').disabled=true;$('#review-status').textContent='Draft preview. Submit reviews from the public website.'}
 // A local receipt makes moderation visible without publishing unapproved content.
 const receipt=document.createElement('div');receipt.id='review-receipt';receipt.hidden=true;receipt.setAttribute('role','status');$('.review-layout').before(receipt);
 const hint=document.createElement('p');hint.className='review-flow';hint.textContent='01 Write your review  →  02 Team approval  →  03 Published here';$('#reviews .section-heading').after(hint);
 const ratingHint=document.createElement('p');ratingHint.id='rating-hint';ratingHint.textContent='Choose your rating';$('.rating-field').append(ratingHint);
 $('#review-form').addEventListener('change',e=>{if(e.target.name==='rating')ratingHint.textContent=['','Poor','Fair','Good','Very good','Excellent'][Number(e.target.value)]});
 const counter=document.createElement('small');counter.id='review-counter';counter.textContent='0 / 2000 characters';const comment=$('#review-form textarea');comment.after(counter);comment.addEventListener('input',()=>{counter.textContent=comment.value.length+' / 2000 characters'});
 const progress=document.createElement('div');progress.className='reading-progress';progress.setAttribute('aria-hidden','true');document.body.append(progress);
 let scheduled=false;const updateProgress=()=>{scheduled=false;const max=document.documentElement.scrollHeight-innerHeight;progress.style.transform='scaleX('+(max>0?Math.min(1,Math.max(0,scrollY/max)):0)+')'};
 addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(updateProgress)}},{passive:true});
 let page=1,loading=false;
 const element=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e};
 async function loadReviews(append=false){
  if(loading)return;loading=true;$('#reviews-more').disabled=true;$('#reviews-retry').hidden=true;
  try{
   const response=await fetch(base+'/api/public/reviews?page='+(append?page+1:1),{signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw new Error();const result=await response.json();
   if(!Array.isArray(result.reviews)||!result.summary)throw new Error();
   const list=$('#review-list');if(!append)list.replaceChildren();
   for(const r of result.reviews){
    const card=element('article','','review-card');
    const meta=element('div','','review-meta'),identity=element('div','','review-identity');
    const avatar=element('span',r.name.trim().split(/\s+/).map(n=>n[0]).slice(0,2).join('').toUpperCase(),'review-avatar');avatar.setAttribute('aria-hidden','true');
    identity.append(avatar,element('strong',r.name));const stars=element('span','★'.repeat(r.rating)+'☆'.repeat(5-r.rating),'review-rating');stars.setAttribute('aria-label',r.rating+' out of 5 stars');meta.append(identity,stars);card.append(meta);
    card.append(element('p',r.comment,'review-comment'));
    const time=element('time',new Date(r.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}));time.dateTime=r.created_at;card.append(time);
    if(r.reply){const reply=element('div','','studio-reply');reply.append(element('strong','Studio reply'),element('p',r.reply));card.append(reply)}
    list.append(card);
   }
   if(!result.summary.total)list.append(element('p','No published reviews yet. Be the first to share your experience.','reviews-empty'));
   $('#review-average').textContent=result.summary.total?result.summary.average+' / 5':'Your voice matters';
   $('#review-count').textContent=result.summary.total+' approved '+(result.summary.total===1?'review':'reviews');
   page=result.page;$('#reviews-more').hidden=!result.hasMore;
  }catch{
   if(!append){$('#review-list').replaceChildren(element('p','Reviews could not be loaded. Please try again.'));$('#review-count').textContent='Reviews temporarily unavailable'}
   $('#reviews-retry').hidden=false;$('#reviews-retry').onclick=()=>loadReviews(append);
  }finally{loading=false;$('#reviews-more').disabled=false}
 }
 $('#reviews-more').addEventListener('click',()=>loadReviews(true));
 loadReviews();
 $('#review-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type=submit]'),status=$('#review-status');
  if(preview||button.disabled||!form.reportValidity())return;
  button.disabled=true;button.textContent='Submitting...';status.textContent='';status.removeAttribute('data-state');
  const fd=new FormData(form),body=Object.fromEntries(fd);body.rating=Number(body.rating);
  try{
   const response=await fetch(base+'/api/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Review could not be submitted.');
   status.dataset.state='success';status.textContent='Review received. It will appear publicly after admin approval.';
   receipt.replaceChildren(element('span','SUBMITTED SUCCESSFULLY','receipt-label'),element('h3','Thank you, '+body.name.trim()+'.'),element('p','Your '+body.rating+'-star review is awaiting approval. This confirmation is visible only in this tab.'),element('blockquote',body.comment,'receipt-comment'));
   receipt.hidden=false;form.reset();counter.textContent='0 / 2000 characters';ratingHint.textContent='Choose your rating';receipt.scrollIntoView?.({behavior:'smooth',block:'center'});
  }catch(error){status.dataset.state='error';status.textContent=error.name==='TimeoutError'?'Request timed out. Please try again.':error.message||'Unable to submit. Please try again.'}
  finally{button.disabled=false;button.textContent='Submit review'}
 });

 const planner=$('#planner-form');
 function brief(){const fd=new FormData(planner);return {kind:fd.get('kind'),features:fd.getAll('features'),timing:fd.get('timing')}}
 planner.addEventListener('change',()=>{const b=brief();$('#planner-kind').textContent=b.kind;$('#planner-features').replaceChildren(...['Responsive design',...b.features].map(f=>element('li',f)));$('#planner-timing').textContent='Timing: '+b.timing});
 planner.addEventListener('submit',e=>{
  e.preventDefault();const b=brief(),message=$('#project-form textarea[name=message]');
  const summary='Project: '+b.kind+'\nFeatures: '+['Responsive design',...b.features].join(', ')+'\nPreferred timing: '+b.timing;
  const next=message.value.trim()?message.value.trim()+'\n\n'+summary:summary;
  if(next.length>message.maxLength){$('#planner-status').textContent='Your message is too long to add the brief. Please shorten it first.';return}
  message.value=next;
  const service=$('#service-select'),match=[...service.options].find(o=>b.kind==='Brand identity'?/brand/i.test(o.value):/website/i.test(o.value));if(match)service.value=match.value;
  location.hash='contact';message.focus({preventScroll:true});$('#form-status').textContent='Your brief is added. Complete your details, then send your enquiry.';
 });
})();
