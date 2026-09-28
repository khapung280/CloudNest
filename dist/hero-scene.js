// A bounded Three.js scene. The existing artwork remains if WebGL or the module is unavailable.
const host=document.querySelector('#hero-scene');
const hero=document.querySelector('.hero');
const toggle=document.querySelector('#scene-toggle');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
if(host&&!navigator.connection?.saveData){
 try{
  const THREE=await import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js');
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.setClearColor(0x080f20,0);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.35;
  host.append(renderer.domElement);
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(35,1,.1,60);camera.position.set(0,0,12);
  const sculpture=new THREE.Group();scene.add(sculpture);
  scene.add(new THREE.HemisphereLight(0xc4eaff,0x17233f,3));
  const key=new THREE.DirectionalLight(0xffffff,5);key.position.set(4,5,6);scene.add(key);
  const rim=new THREE.DirectionalLight(0x2b7dff,7);rim.position.set(-3,0,-2);scene.add(rim);
  const fill=new THREE.DirectionalLight(0x72e8ea,3);fill.position.set(1,-4,4);scene.add(fill);
  const materials=[];
  // Overlapping, twisting ribbons form an open nest; no textures or external models.
  for(let ribbon=0;ribbon<5;ribbon++){
   const positions=[],indices=[],segments=160;
   for(let i=0;i<=segments;i++){
    const t=i/segments*Math.PI*2;
    for(const side of [-1,1]){
     const width=.18*side,twist=t*1.5+ribbon*.7;
     const radius=2+width*Math.cos(twist);
     positions.push(radius*Math.cos(t),radius*Math.sin(t),width*Math.sin(twist)+.26*Math.sin(3*t));
    }
    if(i<segments){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2)}
   }
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
   const material=new THREE.MeshStandardMaterial({color:ribbon%2?0x72acdf:0xd8e8f4,metalness:.55,roughness:.24,side:THREE.DoubleSide});materials.push(material);
   const mesh=new THREE.Mesh(geometry,material);mesh.rotation.set(.35+ribbon*.48,ribbon*.62,ribbon*.26);sculpture.add(mesh);
  }
  let visible=true,paused=reduced.matches,time=0,last=0,disposed=false;
  let pointerX=0,pointerY=0;
  const render=()=>renderer.render(scene,camera);
  function size(){
   if(disposed)return;
   const {width,height}=host.getBoundingClientRect();if(!width||!height)return;
   renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
   const mobile=width<700;sculpture.scale.setScalar(mobile ? .7 : 1.2);sculpture.position.set(mobile ? .35 : 2.7,mobile ? 1.15 : .1,0);render();
  }
  function frame(now){
   if(now-last<32)return;
   time+=Math.min((now-last)/1000,.06);last=now;
   sculpture.rotation.y=time*.12+pointerX*.22;sculpture.rotation.x=.22+Math.sin(time*.2)*.1+pointerY*.1;
   sculpture.rotation.z=Math.sin(time*.13)*.12;render();
  }
  function sync(){
   if(disposed)return;
   const running=visible&&!document.hidden&&!paused;last=performance.now();renderer.setAnimationLoop(running?frame:null);
   toggle.textContent=paused?'\u25b6':'\u275a\u275a';toggle.setAttribute('aria-label',paused?'Play 3D animation':'Pause 3D animation');toggle.title=toggle.getAttribute('aria-label');
   if(!running)render();
  }
  toggle.hidden=false;toggle.addEventListener('click',()=>{paused=!paused;sync()});
  const onPointer=e=>{if(e.pointerType!=='mouse'||paused)return;const box=host.getBoundingClientRect();pointerX=(e.clientX-box.left)/box.width-.5;pointerY=(e.clientY-box.top)/box.height-.5};
  hero.addEventListener('pointermove',onPointer,{passive:true});hero.addEventListener('pointerleave',()=>{pointerX=pointerY=0});
  const visibility=()=>sync();document.addEventListener('visibilitychange',visibility);
  const motion=()=>{paused=reduced.matches;sync()};reduced.addEventListener('change',motion);
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync()});observer.observe(hero);
  const resize=new ResizeObserver(size);resize.observe(host);size();sync();hero.classList.add('scene-ready');
  function dispose(){
   if(disposed)return;disposed=true;renderer.setAnimationLoop(null);observer.disconnect();resize.disconnect();
   document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',motion);hero.removeEventListener('pointermove',onPointer);
   sculpture.children.forEach(mesh=>mesh.geometry.dispose());materials.forEach(material=>material.dispose());renderer.dispose();
   hero.classList.remove('scene-ready');toggle.hidden=true;
  }
  renderer.domElement.addEventListener('webglcontextlost',dispose,{once:true});
  addEventListener('pagehide',e=>{if(!e.persisted)dispose()});
 }catch{hero.classList.remove('scene-ready');toggle.hidden=true;host.replaceChildren()}
}
