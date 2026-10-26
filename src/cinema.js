import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';

// Display-space grading is deliberately restrained: clear silhouettes and
// readable shadows, a little airborne warmth, and no full-screen sepia wash.
export function createCinema(renderer, scene, camera) {
  const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
    type: THREE.HalfFloatType, samples: 0,
  });
  const composer = new EffectComposer(renderer, target);
  const worldPass = new RenderPass(scene, camera);
  // Small contact shadows ground curbs, wall bases and props. Keep the radius
  // under a metre so distant silhouettes do not gain broad black halos.
  const contact = new SSAOPass(scene, camera, 640, 360, 16);
  contact.kernelRadius = .72;
  contact.minDistance = .025 / (camera.far-camera.near);
  contact.maxDistance = .9 / (camera.far-camera.near);
  const contactVisibility = [];
  // Apply contact darkening before smoke, fire, glass and other translucent
  // surfaces. Otherwise silhouettes behind dense smoke leak through as AO.
  const hiddenMaterials = new Set();
  function hideMaterials(translucent) {
    scene.traverse(object=>{
      for(const material of (Array.isArray(object.material)?object.material:[object.material]))
        if(material?.visible && Boolean(material.transparent)===translucent){hiddenMaterials.add(material);material.visible=false;}
    });
  }
  function restoreMaterials(){for(const material of hiddenMaterials)material.visible=true;hiddenMaterials.clear();}
  const renderWorld=worldPass.render.bind(worldPass);
  worldPass.render=(...args)=>{
    if(!contact.enabled)return renderWorld(...args);
    hideMaterials(true);
    try{return renderWorld(...args);}finally{restoreMaterials();}
  };
  const translucentPass=new Pass();translucentPass.needsSwap=false;
  translucentPass.render=(renderer,writeBuffer,readBuffer)=>{
    const background=scene.background,autoClear=renderer.autoClear,shadows=renderer.shadowMap.autoUpdate;
    hideMaterials(false);scene.background=null;renderer.autoClear=false;renderer.shadowMap.autoUpdate=false;
    renderer.setRenderTarget(readBuffer);
    try{renderer.render(scene,camera);}
    finally{restoreMaterials();scene.background=background;renderer.autoClear=autoClear;renderer.shadowMap.autoUpdate=shadows;}
  };
  const renderContact = contact.render.bind(contact);
  contact.render = (...args) => {
    scene.traverse(object => {
      if (!object.isMesh || !object.visible) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some(m => m && (m.isShaderMaterial || m.depthWrite === false))) {
        contactVisibility.push(object); object.visible = false;
      }
    });
    contact.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
    contact.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
    const shadows=args[0].shadowMap.autoUpdate;
    args[0].shadowMap.autoUpdate=false;
    try { renderContact(...args); }
    finally { args[0].shadowMap.autoUpdate=shadows;for (const object of contactVisibility) object.visible=true; contactVisibility.length=0; }
  };
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .14, .32, 1.35);
  const output = new OutputPass();
  const antialias = new ShaderPass(FXAAShader);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, time: { value: 0 }, grain: { value: .006 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float time; uniform float grain;
      varying vec2 vUv;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        vec3 c=texture2D(tDiffuse,vUv).rgb;
        float luminance=dot(c,vec3(.2126,.7152,.0722));
        c=mix(vec3(luminance),c,.82);
        c=(c-.42)*1.065+.42;
        c+=vec3(-.007,.003,.010)*(1.0-smoothstep(.12,.6,luminance));
        c+=vec3(.014,.006,-.009)*smoothstep(.35,.85,luminance);
        float n=hash(gl_FragCoord.xy+floor(time*24.0)*vec2(13.7,29.1))-.5;
        c+=n*grain;
        gl_FragColor=vec4(clamp(c,0.0,1.0),1.0);
      }`,
  });
  composer.addPass(worldPass);
  composer.addPass(contact);
  composer.addPass(translucentPass);
  composer.addPass(bloom);
  composer.addPass(output);
  composer.addPass(grade);
  composer.addPass(antialias);
  const resize = () => {
    composer.setSize(innerWidth, innerHeight);
    const ratio=renderer.getPixelRatio();
    const scale=Math.min(.5,1280/(innerWidth*ratio),720/(innerHeight*ratio));
    contact.setSize(Math.max(1,Math.round(innerWidth*ratio*scale)),Math.max(1,Math.round(innerHeight*ratio*scale)));
    antialias.uniforms.resolution.value.set(1/(innerWidth*ratio),1/(innerHeight*ratio));
  };
  return {
    setQuality(quality) {
      contact.enabled = quality === 'high';
      translucentPass.enabled = contact.enabled;
      bloom.enabled = quality === 'high';
      grade.uniforms.grain.value = quality === 'low' ? 0 : .003;
      // SSAO blends into the opaque target before translucent geometry reuses
      // its depth. Re-entering a resolved MSAA target here corrupts the color
      // buffer on some WebGL drivers; keep this composite single-sampled.
      const samples = Math.min(quality === 'medium' ? 2 : 0, renderer.capabilities.maxSamples);
      for (const buffer of [composer.renderTarget1, composer.renderTarget2]) {
        if (buffer.samples !== samples) { buffer.dispose(); buffer.samples = samples; }
      }
      // FXAA smooths high-preset edges after the complete HDR composite;
      // medium has a single scene pass and can safely retain geometry MSAA.
      antialias.enabled = samples === 0;
      composer.setPixelRatio(renderer.getPixelRatio());
      resize();
    },
    resize,
    render(time, delta) { grade.uniforms.time.value = time; composer.render(delta); },
    inspect() { return {contactShadows:contact.enabled,contactResolution:[contact.width,contact.height],contactRadius:contact.kernelRadius,samples:composer.renderTarget1.samples,fxaa:antialias.enabled}; },
    dispose() { contact.dispose();contact.ssaoMaterial.dispose();contact.noiseTexture.dispose();bloom.dispose(); output.dispose(); grade.dispose(); antialias.dispose(); composer.dispose(); },
  };
}
