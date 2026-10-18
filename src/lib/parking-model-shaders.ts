export const parkingVertexShader = `#version 300 es
      uniform mat4 u_matrix;
      layout(location=0) in vec3 a_position;
      layout(location=1) in vec3 a_normal;
      layout(location=2) in vec4 a_color;
      out vec3 v_normal;
      out vec4 v_color;
      void main(){gl_Position=u_matrix*vec4(a_position,1.0);v_normal=a_normal;v_color=a_color;}`;
export const parkingFragmentShader = `#version 300 es
      precision highp float;
      in vec3 v_normal;
      in vec4 v_color;
      uniform vec3 u_view;
      out vec4 color;
      void main(){
        vec3 n=normalize(v_normal);
        vec3 light=normalize(vec3(-0.4,-0.5,0.85));
        float diffuse=0.53+0.38*max(dot(n,light),0.0)+0.16*max(dot(n,normalize(vec3(0.6,0.4,0.5))),0.0);
        float sheen=pow(max(dot(n,normalize(light+u_view)),0.0),48.0)*0.24;
        vec3 lit=v_color.rgb*diffuse+vec3(sheen);
        color=vec4(lit*v_color.a,v_color.a);
      }`;
