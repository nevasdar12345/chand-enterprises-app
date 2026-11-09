
/* Customer-facing hero motion: progressive enhancement, no dependencies. */
(async function(){
 const hero=document.querySelector('.premium-hero .hero-visual, .hero .hero-visual');
 if(!hero)return;
 try{
  const response=await fetch('/api/hero-motion',{headers:{Accept:'application/json'}});
  if(!response.ok)return;
  const {settings={}}=await response.json();
  const allowed=['both','desktop','mobile'];
  if(!allowed.includes(settings.device||'both'))return;
  const mobile=matchMedia('(max-width:700px)').matches;
  if(settings.device==='desktop'&&mobile||settings.device==='mobile'&&!mobile)return;
  hero.classList.add('ce-hero-motion');
  hero.dataset.motion=settings.preset||'glacier-awakening';
  hero.style.setProperty('--ce-motion-duration',(Number(settings.duration)||6)+'s');
  hero.style.setProperty('--ce-particle-opacity',String((Number(settings.particles??65))/100));
  const layers=document.createElement('div');layers.className='ce-motion-layers';layers.setAttribute('aria-hidden','true');
  layers.innerHTML='<span class="ce-motion-ring"></span><span class="ce-motion-ice ice-a">◆</span><span class="ce-motion-ice ice-b">❄</span><span class="ce-motion-bubble bubble-a"></span><span class="ce-motion-bubble bubble-b"></span><span class="ce-motion-splash"></span>';
  hero.appendChild(layers);
  if(settings.intensity==='subtle')hero.classList.add('motion-subtle');
  if(settings.intensity==='dynamic')hero.classList.add('motion-dynamic');
  if(settings.playback==='once')hero.classList.add('motion-once');
  if(settings.playback==='scroll'&&'IntersectionObserver'in window){
   hero.classList.add('motion-paused');
   const observer=new IntersectionObserver(entries=>entries.forEach(e=>{hero.classList.toggle('motion-paused',!e.isIntersecting)}),{threshold:.25});
   observer.observe(hero);
  }
 }catch(e){/* Keep the original static hero if animation settings cannot load. */}
})();
