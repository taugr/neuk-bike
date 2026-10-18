export const parkingVertexShader = `#version 300 es
      uniform mat4 u_matrix;
      uniform vec2 u_viewport;
      uniform float u_expand;
      layout(location=0) in vec3 a_position;
      layout(location=1) in vec3 a_normal;
      layout(location=2) in vec4 a_color;
      out vec3 v_normal;
      out vec4 v_color;
      void main(){
        vec4 position=u_matrix*vec4(a_position,1.0);
        if(u_expand>0.0 && position.w>0.0){
          vec4 normalPoint=u_matrix*vec4(a_position+a_normal,1.0);
          vec2 direction=(normalPoint.xy/normalPoint.w-position.xy/position.w)*u_viewport;
          float lengthPx=length(direction);
          if(lengthPx>0.0001) position.xy+=direction/lengthPx*(2.0*u_expand/u_viewport)*position.w;
        }
        gl_Position=position;v_normal=a_normal;v_color=a_color;
      }`;
export const parkingFragmentShader = `#version 300 es
      precision highp float;
      in vec3 v_normal;
      in vec4 v_color;
      uniform vec3 u_view;
      uniform bool u_satellite;
      uniform bool u_outline;
      out vec4 color;
      void main(){
        if(u_outline){color=vec4(0.035,0.065,0.06,1.0);return;}
        vec3 n=normalize(v_normal);
        vec3 light=normalize(vec3(-0.4,-0.5,0.85));
        float diffuse=0.53+0.38*max(dot(n,light),0.0)+0.16*max(dot(n,normalize(vec3(0.6,0.4,0.5))),0.0);
        float sheen=pow(max(dot(n,normalize(light+u_view)),0.0),48.0)*0.24;
        vec3 lit=v_color.rgb*diffuse+vec3(sheen);
        float alpha=v_color.a;
        if(u_satellite && v_color.a>0.99){
          lit=v_color.rgb*max(diffuse,0.80)+vec3(sheen*1.3);
        } else if(u_satellite){
          float rim=pow(1.0-abs(dot(n,normalize(u_view))),3.0);
          alpha=min(0.55,alpha+0.10*rim);
          lit=v_color.rgb*(0.85+0.15*diffuse)+vec3(sheen*0.6);
        }
        color=vec4(lit*alpha,alpha);
      }`;
