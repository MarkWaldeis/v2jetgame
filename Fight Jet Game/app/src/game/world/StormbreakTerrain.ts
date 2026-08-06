import * as THREE from 'three';

const SEA_LEVEL = 0;
const BASE_Y = 32;

function hash(x: number, y: number) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function smooth(value: number) {
  return value * value * (3 - 2 * value);
}

function smoothstep(min: number, max: number, value: number) {
  return smooth(THREE.MathUtils.clamp((value - min) / (max - min), 0, 1));
}

function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = smooth(fx), v = smooth(fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, octaves: number) {
  let value = 0, amplitude = 1, frequency = 1, normalizer = 0;
  for (let i = 0; i < octaves; i++) {
    value += noise(x * frequency, y * frequency) * amplitude;
    normalizer += amplitude;
    amplitude *= 0.5;
    frequency *= 2.07;
  }
  return value / normalizer;
}

function ridgedFbm(x: number, y: number, octaves: number) {
  let value = 0, amplitude = 1, frequency = 1, normalizer = 0;
  for (let i = 0; i < octaves; i++) {
    const ridge = 1 - Math.abs(noise(x * frequency, y * frequency) * 2 - 1);
    value += ridge * ridge * amplitude;
    normalizer += amplitude;
    amplitude *= 0.53;
    frequency *= 2.13;
  }
  return value / normalizer;
}

function seeded(index: number, salt: number) {
  return hash(index * 1.731 + salt * 13.17, index * 0.917 - salt * 8.31);
}

/** 42 × 42 km volcanic archipelago, collision field and instanced world detail. */
export class Terrain {
  readonly mesh = new THREE.Group();
  readonly size: number;
  readonly heightTexture: THREE.DataTexture;
  private readonly segments = 448;
  private readonly heights: Float32Array;
  private radar: THREE.Object3D | null = null;
  private beaconMaterial: THREE.MeshStandardMaterial | null = null;

  constructor(worldSize = 42000) {
    this.size = worldSize;
    this.mesh.name = 'stormbreak-archipelago';
    const geometry = new THREE.PlaneGeometry(worldSize, worldSize, this.segments, this.segments);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    this.heights = new Float32Array((this.segments + 1) ** 2);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      const height = this.computeHeight(x, z);
      positions.setY(i, height);
      const ix = Math.round(((x + worldSize / 2) / worldSize) * this.segments);
      const iz = Math.round(((z + worldSize / 2) / worldSize) * this.segments);
      this.heights[iz * (this.segments + 1) + ix] = height;
    }
    geometry.computeVertexNormals();
    const terrain = new THREE.Mesh(geometry, this.terrainMaterial());
    terrain.name = 'stormbreak-terrain-slope-pbr';
    terrain.receiveShadow = true;
    this.mesh.add(terrain);

    this.heightTexture = new THREE.DataTexture(
      this.heights, this.segments + 1, this.segments + 1, THREE.RedFormat, THREE.FloatType
    );
    this.heightTexture.minFilter = THREE.LinearFilter;
    this.heightTexture.magFilter = THREE.LinearFilter;
    this.heightTexture.wrapS = this.heightTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.heightTexture.needsUpdate = true;

    this.buildAirbase();
    this.buildSettlements();
    this.buildInfrastructure();
    this.buildNature();
  }

  private island(x: number, z: number, cx: number, cz: number, rx: number, rz: number, rotation: number) {
    const cosine = Math.cos(rotation), sine = Math.sin(rotation);
    const dx = x - cx, dz = z - cz;
    const px = (dx * cosine - dz * sine) / rx;
    const pz = (dx * sine + dz * cosine) / rz;
    const coast = (fbm(x * 0.00024 + cx * 0.001, z * 0.00024 + cz * 0.001, 4) - 0.5) * 0.42;
    return 1 - smoothstep(0.68 + coast, 1.05 + coast, Math.hypot(px, pz));
  }

  private computeHeight(x: number, z: number) {
    const wx = x + (fbm(x * 0.00011 + 17, z * 0.00011 - 9, 3) - 0.5) * 2600;
    const wz = z + (fbm(x * 0.00011 - 27, z * 0.00011 + 31, 3) - 0.5) * 2600;
    const main = this.island(wx, wz, -500, 400, 9000, 12100, -0.24);
    const land = Math.max(
      main,
      this.island(wx, wz, 10500, -9800, 4300, 6800, 0.48) * 0.94,
      this.island(wx, wz, -12500, -5500, 4600, 7200, -0.58) * 0.9,
      this.island(wx, wz, 10200, 12400, 5200, 3600, 0.18) * 0.84,
      this.island(wx, wz, -12800, 12000, 3100, 4700, 0.7) * 0.68
    );
    const seaFloor = -980 + fbm(x * 0.00028 + 90, z * 0.00028 - 12, 4) * 360;
    const broad = fbm(wx * 0.00015, wz * 0.00015, 5);
    const ridges = ridgedFbm(wx * 0.00037 + 41, wz * 0.00037 + 41, 5);
    const erosion = fbm(wx * 0.00072 - 18, wz * 0.00072 + 7, 4);
    let height = (55 + Math.pow(broad, 1.3) * 520 + Math.pow(ridges, 1.55) * 1080) * (0.88 + erosion * 0.24);
    const calderaDistance = Math.hypot(x + 3100, z + 2700);
    height += Math.pow(Math.max(0, 1 - calderaDistance / 6500), 1.45) * 1250;
    height -= Math.pow(Math.max(0, 1 - calderaDistance / 1050), 2.1) * 720;
    const canyonLine = -1350 + x * 0.31 + Math.sin(x * 0.00048) * 820;
    height -= (1 - smoothstep(180, 920, Math.abs(z - canyonLine))) * (420 + ridges * 310) * main;
    height = THREE.MathUtils.lerp(seaFloor, height, smoothstep(0.04, 0.5, land));
    const baseRadius = Math.hypot(x / 2050, (z - 3200) / 1550);
    height = THREE.MathUtils.lerp(height, BASE_Y, 1 - smoothstep(0.72, 1.06, baseRadius));
    if (land > 0.03 && land < 0.22) {
      height = THREE.MathUtils.lerp(height, -18 + land * 135, smoothstep(0.03, 0.22, land));
    }
    return THREE.MathUtils.clamp(height, -1100, 2750);
  }

  private terrainMaterial() {
    return new THREE.ShaderMaterial({
      name: 'StormbreakSlopeMicroPBR',
      uniforms: {
        sunDirection: { value: new THREE.Vector3(0.48, 0.72, 0.36).normalize() },
        fogColor: { value: new THREE.Color(0x91acb7) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition; varying vec3 vNormal; varying float vHeight;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPosition = world.xyz; vNormal = normalize(mat3(modelMatrix) * normal); vHeight = world.y;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform vec3 sunDirection; uniform vec3 fogColor;
        varying vec3 vWorldPosition; varying vec3 vNormal; varying float vHeight;
        float hash21(vec2 p) { p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
        float n2(vec2 p) { vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+1.0),f.x),f.y); }
        float detail(vec2 p) { float n=0.0,a=.5; for(int i=0;i<5;i++){n+=n2(p)*a;p=p*2.03+17.7;a*=.5;} return n; }
        void main() {
          vec3 normal=normalize(vNormal); float slope=1.0-clamp(normal.y,0.0,1.0);
          float macro=detail(vWorldPosition.xz*.0016), micro=detail(vWorldPosition.xz*.045);
          float distanceToCamera=distance(cameraPosition,vWorldPosition);
          float nearDetail=1.0-smoothstep(900.0,6500.0,distanceToCamera);
          vec2 gradient=vec2(dFdx(micro),dFdy(micro)); normal=normalize(normal+vec3(gradient.x,0,gradient.y)*2.8*nearDetail);
          vec3 sand=mix(vec3(.28,.31,.25),vec3(.62,.57,.41),smoothstep(-22.0,14.0,vHeight));
          vec3 vegetation=mix(vec3(.085,.21,.12),vec3(.26,.34,.18),macro);
          vec3 rock=mix(vec3(.105,.12,.115),vec3(.29,.30,.28),macro*.55);
          vec3 base=mix(sand,vegetation,smoothstep(8.0,85.0,vHeight)); base=mix(base,rock,smoothstep(.16,.62,slope));
          base=mix(base,vec3(.48,.49,.47),smoothstep(1550.0,2450.0,vHeight)*(1.0-slope*.35));
          base*=mix(.86,1.13,micro*nearDetail+macro*(1.0-nearDetail));
          float light=clamp((dot(normal,sunDirection)+.34)/1.34,0.0,1.0);
          vec3 color=base*(.36+light*.84);
          gl_FragColor=vec4(mix(color,fogColor,smoothstep(3500.0,34000.0,distanceToCamera)),1.0);
        }
      `,
    });
  }

  private material(color: number, roughness = 0.78, metalness = 0.04) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  private box(parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], material: THREE.Material, yaw = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position); mesh.rotation.y = yaw; parent.add(mesh); return mesh;
  }

  private buildAirbase() {
    const group = new THREE.Group(); group.name = 'naval-air-station-kestrel';
    const asphalt = this.material(0x242a2c, .96, .02), concrete = this.material(0x606764, .92, .02);
    const white = this.material(0xd9ddd5, .65, .05), metal = this.material(0x68736f, .72, .18), dark = this.material(0x273136, .55, .45);
    this.box(group,[210,.7,2850],[0,BASE_Y+.25,3200],concrete); this.box(group,[92,1.2,2750],[0,BASE_Y+.9,3200],asphalt);
    this.box(group,[520,.65,1450],[380,BASE_Y+.3,3000],concrete,-.05);
    const matrix = new THREE.Matrix4();
    const markings = new THREE.InstancedMesh(new THREE.BoxGeometry(5,.18,42),white,30);
    for(let i=0;i<30;i++){matrix.makeTranslation(0,BASE_Y+1.58,1915+i*88);markings.setMatrixAt(i,matrix);} markings.instanceMatrix.needsUpdate=true; markings.name='runway-centerline-instanced';group.add(markings);
    this.beaconMaterial = new THREE.MeshStandardMaterial({color:0x79dfff,emissive:0x2dbfe8,emissiveIntensity:5,roughness:.2,toneMapped:false});
    const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(1.15,6,4),this.beaconMaterial,64);
    for(let i=0;i<32;i++){matrix.makeTranslation(-53,BASE_Y+2.2,1850+i*88);lights.setMatrixAt(i*2,matrix);matrix.makeTranslation(53,BASE_Y+2.2,1850+i*88);lights.setMatrixAt(i*2+1,matrix);}lights.instanceMatrix.needsUpdate=true;lights.name='runway-edge-lights-instanced';group.add(lights);
    for(const [x,z] of [[330,2380],[510,2380],[330,2710],[510,2710],[-360,3550],[-540,3550]]){
      const lod=new THREE.LOD(), near=new THREE.Group(); this.box(near,[138,34,118],[0,0,0],metal); this.box(near,[112,23,2],[0,-3,-60],dark);
      const roof=new THREE.Mesh(new THREE.CylinderGeometry(69,69,118,16,1,false,0,Math.PI),dark);roof.rotation.set(Math.PI/2,0,Math.PI/2);roof.position.y=17;near.add(roof);
      const far=new THREE.Mesh(new THREE.BoxGeometry(140,42,120),metal);lod.addLevel(near,0);lod.addLevel(far,3600);lod.position.set(x,BASE_Y+17,z);lod.name='hangar-lod';group.add(lod);
    }
    const buildings=new THREE.InstancedMesh(new THREE.BoxGeometry(72,20,38),metal,18), roofs=new THREE.InstancedMesh(new THREE.BoxGeometry(76,4,42),dark,18);
    for(let i=0;i<18;i++){const x=-880+(i%6)*118,z=2500+Math.floor(i/6)*185;matrix.makeTranslation(x,BASE_Y+10,z);buildings.setMatrixAt(i,matrix);matrix.makeTranslation(x,BASE_Y+22,z);roofs.setMatrixAt(i,matrix);}buildings.instanceMatrix.needsUpdate=roofs.instanceMatrix.needsUpdate=true;buildings.name='airbase-service-buildings-instanced';group.add(buildings,roofs);
    this.box(group,[42,54,42],[-260,BASE_Y+27,2850],concrete);this.box(group,[68,17,68],[-260,BASE_Y+62,2850],dark);this.box(group,[61,11,61],[-260,BASE_Y+64,2850],this.material(0x75a8b8,.18,.25));
    this.radar=new THREE.Mesh(new THREE.SphereGeometry(26,16,10,0,Math.PI*2,0,Math.PI/2),white);this.radar.scale.y=.24;this.radar.rotation.x=-.45;this.radar.position.set(-450,BASE_Y+61,3180);group.add(this.radar);
    const tanks=new THREE.InstancedMesh(new THREE.CylinderGeometry(16,16,25,16),this.material(0x8d9995,.76,.22),12);for(let i=0;i<12;i++){matrix.makeTranslation(690+(i%4)*45,BASE_Y+12.5,3300+Math.floor(i/4)*48);tanks.setMatrixAt(i,matrix);}tanks.instanceMatrix.needsUpdate=true;tanks.name='fuel-tanks-instanced';group.add(tanks);this.mesh.add(group);
  }

  private buildSettlements() {
    const group=new THREE.Group();group.name='coastal-settlements-instanced';const count=112,matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3(),position=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
    const houses=new THREE.InstancedMesh(new THREE.BoxGeometry(24,12,30),this.material(0xb3aa94,.88,.02),count), roofs=new THREE.InstancedMesh(new THREE.ConeGeometry(22,9,4),this.material(0x6d4335,.82,.04),count);
    for(let i=0;i<count;i++){const second=i>=64,x=(second?-9400:5200)+(seeded(i,3)-.5)*(second?1300:1600),z=(second?-2700:5600)+(seeded(i,8)-.5)*(second?1200:950),y=this.getHeight(x,z),s=.78+seeded(i,15)*.62;quaternion.setFromAxisAngle(up,seeded(i,11)*Math.PI);scale.setScalar(s);position.set(x,y+6*s,z);matrix.compose(position,quaternion,scale);houses.setMatrixAt(i,matrix);position.y=y+15.8*s;matrix.compose(position,quaternion,scale);roofs.setMatrixAt(i,matrix);}houses.instanceMatrix.needsUpdate=roofs.instanceMatrix.needsUpdate=true;group.add(houses,roofs);this.mesh.add(group);
  }

  private buildInfrastructure() {
    const group=new THREE.Group();group.name='roads-bridge-power-grid';const steel=this.material(0x30383b,.62,.52),matrix=new THREE.Matrix4();const bx=3100,bz=-260,by=Math.max(this.getHeight(bx-300,bz),this.getHeight(bx+300,bz))+52;this.box(group,[820,8,34],[bx,by,bz],this.material(0x535b5a,.9,.04),.03);
    const poles=new THREE.InstancedMesh(new THREE.CylinderGeometry(1.1,1.8,34,6),steel,44);for(let i=0;i<44;i++){const x=860+i*115,z=3850+Math.sin(i*.24)*180;matrix.makeTranslation(x,this.getHeight(x,z)+17,z);poles.setMatrixAt(i,matrix);}poles.instanceMatrix.needsUpdate=true;poles.name='power-poles-instanced';group.add(poles);this.mesh.add(group);
  }

  private slopeAt(x:number,z:number){const d=55;return Math.hypot(this.getHeight(x+d,z)-this.getHeight(x-d,z),this.getHeight(x,z+d)-this.getHeight(x,z-d))/(d*2);}

  private buildNature() {
    const group=new THREE.Group();group.name='instanced-vegetation-and-rocks';const treeCount=2400,rockCount=720,matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3(),position=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
    const crowns=new THREE.InstancedMesh(new THREE.ConeGeometry(9,32,7),this.material(0x153d24,.94,0),treeCount),trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(1.2,2.1,18,5),this.material(0x3c2f24,1,0),treeCount),rocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(11),this.material(0x373b38,.97,.02),rockCount);
    let placed=0;for(let i=0;placed<treeCount&&i<treeCount*18;i++){const x=(seeded(i,21)-.5)*this.size*.93,z=(seeded(i,29)-.5)*this.size*.93,y=this.getHeight(x,z);if(y<18||y>920||this.slopeAt(x,z)>.72||Math.hypot(x/2500,(z-3200)/1900)<1)continue;const s=.65+seeded(i,33)*1.15;quaternion.setFromAxisAngle(up,seeded(i,35)*Math.PI*2);scale.setScalar(s);position.set(x,y+16*s,z);matrix.compose(position,quaternion,scale);crowns.setMatrixAt(placed,matrix);position.y=y+9*s;matrix.compose(position,quaternion,scale);trunks.setMatrixAt(placed,matrix);placed++;}crowns.count=trunks.count=placed;crowns.instanceMatrix.needsUpdate=trunks.instanceMatrix.needsUpdate=true;
    placed=0;for(let i=0;placed<rockCount&&i<rockCount*20;i++){const x=(seeded(i,42)-.5)*this.size*.92,z=(seeded(i,48)-.5)*this.size*.92,y=this.getHeight(x,z);if(y<35||(y<650&&this.slopeAt(x,z)<.3))continue;const s=.55+seeded(i,53)*2.5;quaternion.setFromEuler(new THREE.Euler(seeded(i,57),seeded(i,59)*Math.PI,seeded(i,61)));scale.set(s,s*(.55+seeded(i,62)),s*(.65+seeded(i,63)));position.set(x,y+5*s,z);matrix.compose(position,quaternion,scale);rocks.setMatrixAt(placed++,matrix);}rocks.count=placed;rocks.instanceMatrix.needsUpdate=true;group.add(crowns,trunks,rocks);this.mesh.add(group);
  }

  getHeight(x:number,z:number){const half=this.size/2;if(x< -half||x>half||z< -half||z>half)return SEA_LEVEL;const gx=((x+half)/this.size)*this.segments,gz=((z+half)/this.size)*this.segments,x0=Math.min(Math.floor(gx),this.segments-1),z0=Math.min(Math.floor(gz),this.segments-1),fx=gx-x0,fz=gz-z0,row=this.segments+1,h00=this.heights[z0*row+x0],h10=this.heights[z0*row+x0+1],h01=this.heights[(z0+1)*row+x0],h11=this.heights[(z0+1)*row+x0+1];return h00*(1-fx)*(1-fz)+h10*fx*(1-fz)+h01*(1-fx)*fz+h11*fx*fz;}
  update(time:number){if(this.radar)this.radar.rotation.y=time*.42;if(this.beaconMaterial)this.beaconMaterial.emissiveIntensity=4.4+Math.sin(time*3.1)*.7;}
}

/** Gerstner ocean with Fresnel reflection, refraction tint, foam and jet spray. */
export class Sea {
  readonly mesh=new THREE.Group();
  private readonly surface:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
  private readonly spray:THREE.Points<THREE.BufferGeometry,THREE.PointsMaterial>;
  private readonly terrain: Terrain;
  private readonly sprayPositions=new Float32Array(96*3);
  private lastPosition=new THREE.Vector3();private lastTime=0;
  constructor(terrain:Terrain){this.terrain=terrain;this.mesh.name='stormbreak-gerstner-ocean';const geometry=new THREE.PlaneGeometry(terrain.size*4,terrain.size*4,144,144);geometry.rotateX(-Math.PI/2);
    const material=new THREE.ShaderMaterial({name:'StormbreakGerstnerFresnelWater',transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{time:{value:0},heightMap:{value:terrain.heightTexture},terrainSize:{value:terrain.size},deep:{value:new THREE.Color(0x082d45)},shallow:{value:new THREE.Color(0x16859a)},sky:{value:new THREE.Color(0x78aabd)},horizon:{value:new THREE.Color(0x6793a2)},fog:{value:new THREE.Color(0x91acb7)}},
      vertexShader:/* glsl */`uniform float time;varying vec3 vWorld;varying float vCrest;vec3 w(vec3 p,vec2 d,float q,float l,float s){float k=6.2831853/l,phase=k*(dot(d,p.xz)-s*time),a=q/k;return vec3(d.x*a*cos(phase),a*sin(phase),d.y*a*cos(phase));}void main(){vec3 p=position,v=vec3(0);v+=w(p,normalize(vec2(1,.28)),.34,92.,14.);v+=w(p,normalize(vec2(-.35,1)),.25,47.,9.);v+=w(p,normalize(vec2(.74,-.68)),.17,21.,5.5);v+=w(p,normalize(vec2(-.9,-.2)),.09,9.5,3.4);p+=v;vec4 world=modelMatrix*vec4(p,1);vWorld=world.xyz;vCrest=smoothstep(1.,4.6,v.y);gl_Position=projectionMatrix*viewMatrix*world;}`,
      fragmentShader:/* glsl */`precision highp float;uniform float time;uniform sampler2D heightMap;uniform float terrainSize;uniform vec3 deep,shallow,sky,horizon,fog;varying vec3 vWorld;varying float vCrest;vec2 slope(vec2 p){vec2 a=normalize(vec2(1,.28)),b=normalize(vec2(-.35,1)),c=normalize(vec2(.74,-.68)),d=normalize(vec2(-.9,-.2));return a*.34*cos(dot(a,p)*(6.2831853/92.)-time*.956)+b*.25*cos(dot(b,p)*(6.2831853/47.)-time*1.203)+c*.17*cos(dot(c,p)*(6.2831853/21.)-time*1.646)+d*.09*cos(dot(d,p)*(6.2831853/9.5)-time*2.248);}void main(){float dist=distance(cameraPosition,vWorld),lod=mix(.07,1.,1.-smoothstep(1800.,18000.,dist));vec2 sl=slope(vWorld.xz)*lod;vec3 normal=normalize(vec3(-sl.x,1,-sl.y)),view=normalize(cameraPosition-vWorld);float fresnel=.035+.965*pow(1.-max(dot(normal,view),0.),5.);vec2 uv=vWorld.xz/terrainSize+.5;float inside=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);float h=texture2D(heightMap,clamp(uv,0.,1.)).r,depth=mix(500.,max(0.,-h),inside),depthMix=smoothstep(6.,190.,depth);vec3 color=mix(mix(shallow,deep,depthMix),mix(horizon,sky,clamp(normal.y*.7+view.y*.3,0.,1.)),fresnel*.78);float foamAmount=clamp((1.-smoothstep(.8,18.,depth))*inside*.72+vCrest*.22,0.,1.);color=mix(color,vec3(.82,.91,.88),foamAmount);color=mix(color,fog,smoothstep(9000.,39000.,dist)*.78);gl_FragColor=vec4(color,mix(.74,.96,depthMix)+foamAmount*.04);}`});
    this.surface=new THREE.Mesh(geometry,material);this.surface.name='water-surface-fresnel-gerstner';this.surface.renderOrder=2;this.mesh.add(this.surface);
    const sprayGeometry=new THREE.BufferGeometry();sprayGeometry.setAttribute('position',new THREE.BufferAttribute(this.sprayPositions,3));const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const context=canvas.getContext('2d')!,gradient=context.createRadialGradient(16,16,0,16,16,16);gradient.addColorStop(0,'rgba(255,255,255,.9)');gradient.addColorStop(1,'rgba(180,230,255,0)');context.fillStyle=gradient;context.fillRect(0,0,32,32);const texture=new THREE.CanvasTexture(canvas);
    this.spray=new THREE.Points(sprayGeometry,new THREE.PointsMaterial({color:0xdffbff,map:texture,transparent:true,opacity:.68,depthWrite:false,size:8,blending:THREE.AdditiveBlending,toneMapped:false}));this.spray.name='low-flight-sea-spray';this.spray.visible=false;this.spray.frustumCulled=false;this.mesh.add(this.spray);
  }
  setVisible(visible:boolean){this.mesh.visible=visible;}
  update(time:number,player?:THREE.Vector3){if(!this.mesh.visible)return;this.surface.material.uniforms.time.value=time;if(!player)return;const delta=Math.max(1/120,Math.min(.1,time-this.lastTime)),velocity=player.clone().sub(this.lastPosition).divideScalar(delta),active=this.terrain.getHeight(player.x,player.z)<-3&&player.y>2&&player.y<58&&velocity.length()>70;this.spray.visible=active;if(active){const trail=velocity.normalize();for(let i=0;i<96;i++){const age=(i/96+time*.55)%1,side=Math.sin(i*12.989)*(3+age*28);this.sprayPositions[i*3]=player.x-trail.x*age*130-trail.z*side;this.sprayPositions[i*3+1]=1.5+age*12+Math.sin(i*3.7+time*9)*1.4;this.sprayPositions[i*3+2]=player.z-trail.z*age*130+trail.x*side;}this.spray.geometry.attributes.position.needsUpdate=true;}this.lastPosition.copy(player);this.lastTime=time;}
}
