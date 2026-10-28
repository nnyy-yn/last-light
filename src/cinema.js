import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// Display-space grading is deliberately restrained: clear silhouettes and
// readable shadows, a little airborne warmth, and no full-screen sepia wash.
export function createCinema(renderer, scene, camera) {
  const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
    type: THREE.HalfFloatType, samples: 0,
  });
  const composer = new EffectComposer(renderer, target);
  const worldPass = new RenderPass(scene, camera);
  // Render city geometry once. The former high preset repeated every skinned
  // actor for normal/depth/AO and a separate translucent pass. Real sun/local
  // shadows and authored recesses still ground geometry; smoke uses the same
  // depth buffer as the world, without AO silhouettes leaking through it.
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
  composer.addPass(bloom);
  composer.addPass(output);
  composer.addPass(grade);
  composer.addPass(antialias);
  const resize = () => {
    composer.setSize(innerWidth, innerHeight);
    const ratio=renderer.getPixelRatio();
    antialias.uniforms.resolution.value.set(1/(innerWidth*ratio),1/(innerHeight*ratio));
  };
  return {
    setQuality(quality) {
      bloom.enabled = quality === 'high';
      grade.uniforms.grain.value = quality === 'low' ? 0 : .003;
      const samples = Math.min(quality === 'low' ? 0 : 2, renderer.capabilities.maxSamples);
      for (const buffer of [composer.renderTarget1, composer.renderTarget2]) {
        if (buffer.samples !== samples) { buffer.dispose(); buffer.samples = samples; }
      }
      // One geometry pass permits MSAA without reopening a resolved target.
      antialias.enabled = samples === 0;
      composer.setPixelRatio(renderer.getPixelRatio());
      resize();
    },
    resize,
    render(time, delta) { grade.uniforms.time.value = time; composer.render(delta); },
    inspect() { return {scenePasses:1,contactShadows:false,shadowSource:'sun-and-local-lights',samples:composer.renderTarget1.samples,fxaa:antialias.enabled}; },
    dispose() { bloom.dispose(); output.dispose(); grade.dispose(); antialias.dispose(); composer.dispose(); },
  };
}
