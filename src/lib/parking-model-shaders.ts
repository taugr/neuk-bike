export const parkingVertexShader = `#version 300 es
      uniform mat4 u_matrix;
      uniform vec2 u_viewport;
      uniform float u_expand;
      layout(location=0) in vec3 a_position;
      layout(location=1) in vec3 a_normal;
      layout(location=2) in vec4 a_color;
      layout(location=3) in float a_finish;
      out vec3 v_position;
      out vec3 v_normal;
      out vec4 v_color;
      flat out highp int v_finish;
      void main(){
        vec4 position=u_matrix*vec4(a_position,1.0);
        if(u_expand>0.0 && position.w>0.0){
          vec4 normalPoint=u_matrix*vec4(a_position+a_normal,1.0);
          vec2 direction=(normalPoint.xy/normalPoint.w-position.xy/position.w)*u_viewport;
          float lengthPx=length(direction);
          if(lengthPx>0.0001) position.xy+=direction/lengthPx*(2.0*u_expand/u_viewport)*position.w;
        }
        gl_Position=position;
        v_position=a_position;
        v_normal=a_normal;
        v_color=a_color;
        v_finish=int(a_finish);
      }`;
export const parkingFragmentShader = `#version 300 es
      precision highp float;
      in vec3 v_position;
      in vec3 v_normal;
      in vec4 v_color;
      flat in highp int v_finish;
      uniform vec3 u_view;
      uniform bool u_satellite;
      uniform bool u_outline;
      uniform sampler2D u_surface;
      uniform bool u_surface_ready;
      out vec4 color;
      void main(){
        if(v_finish==6){
          float distanceFromSupport=length(v_normal.xy);
          float alpha=0.24*(1.0-smoothstep(0.15,1.0,distanceFromSupport));
          color=vec4(vec3(0.05,0.07,0.06)*alpha,alpha);
          return;
        }
        if(u_outline){color=vec4(0.035,0.065,0.06,1.0);return;}
        vec3 n=normalize(v_normal);
        vec3 light=normalize(vec3(-0.45,-0.5,0.76));
        float sun=max(dot(n,light),0.0);
        float sky=0.5+0.5*n.z;
        vec3 reflection=reflect(-u_view,n);
        float highlight=max(dot(n,normalize(light+u_view)),0.0);
        float alpha=v_color.a;
        float footprint=length(fwidth(v_position));
        float detail=1.0-smoothstep(0.025,0.075,footprint);
        vec3 lit;
        if(alpha<0.99){
          float grazing=1.0-abs(dot(n,u_view));
          float rim=grazing*grazing*grazing;
          float reflectedSky=smoothstep(-0.15,0.35,reflection.z);
          lit=mix(v_color.rgb*0.64,vec3(0.83,0.93,1.0),reflectedSky*0.8);
          alpha=min(0.54,alpha*(0.62+0.26*reflectedSky)+0.25*rim+0.13*pow(highlight,28.0));
          if(detail>0.0){
            // Repeat along the panel so the ribs follow the curve of the roof.
            float ribs=pow(0.5+0.5*cos(v_position.y*40.0),7.0)*detail;
            lit=mix(lit,vec3(0.48,0.62,0.69),0.38*ribs);
            alpha=min(0.56,alpha+0.065*ribs);
          }
        } else {
          float diffuse=0.47+0.40*sun+0.23*sky;
          if(v_finish==1){
            // The bright band follows the curved steel as the map rotates.
            float horizon=smoothstep(-0.2,0.24,reflection.z);
            diffuse=0.59+0.33*sun+0.25*horizon;
            if(footprint<0.015){
              float grain=sin(dot(v_position,vec3(91.0,167.0,101.0)))
                *sin(dot(v_position,vec3(163.0,-87.0,149.0)));
              diffuse+=0.05*grain*(1.0-smoothstep(0.003,0.015,footprint));
            }
            lit=v_color.rgb*max(diffuse,u_satellite?0.79:0.0)+vec3(0.31*pow(highlight,24.0));
          } else {
            float sheen=v_finish==2?0.16*pow(highlight,14.0):0.0;
            lit=v_color.rgb*max(diffuse,u_satellite?0.76:0.0)+vec3(sheen);
          }
          if(v_finish==7){
            // Soft transmitted light keeps leaf clusters distinct beneath a top light.
            lit+=v_color.rgb*vec3(0.13,0.18,0.055)*max(dot(-n,light),0.0);
          }
          if(detail>0.0 && v_finish>=2){
            float mip=log2(max(1.0,footprint*120.0));
            float relief=0.0;
            if(v_finish==3 || v_finish==4){
              float across=abs(n.z)>abs(n.y)?v_position.y:v_position.z;
              vec2 grainUV=vec2(v_position.x*0.6,across*1.9);
              if(v_finish==4){
                grainUV=vec2(v_position.z*0.58,(v_position.x+v_position.y)*2.1);
              }
              float wave=sin(grainUV.y*53.0+sin(grainUV.x*13.0));
              if(v_finish==3 && abs(n.x)>0.82){
                float radius=length(v_position.yz-vec2(0.0,0.24));
                wave=sin(radius*71.0+sin(v_position.y*17.0));
              }
              relief=0.12*wave;
              if(u_surface_ready) relief+=0.54*(textureLod(u_surface,grainUV,mip).r-0.5);
            } else if(u_surface_ready){
              vec2 uv=abs(n.z)>0.6?v_position.xy:vec2(v_position.x+v_position.y,v_position.z);
              vec2 wear=textureLod(u_surface,uv*1.25,mip).gb-0.5;
              relief=v_finish==2?0.25*wear.x:(v_finish==7?0.62:0.44)*wear.y;
            }
            lit*=1.0+relief*detail;
          }
          // Mute light at fixtures' contact points so plates and rails read as grounded.
          lit*=mix(0.79,1.0,smoothstep(0.0,0.26,v_position.z));
        }
        color=vec4(lit*alpha,alpha);
      }`;
