import { defineStore } from '../pinia/index'
import { reactive } from 'vue';

export const mainStore = defineStore('main',{
  state:()=>{
    return{
      a:1,
      c:reactive({res:100})
    }
  },
  getters:{
    changeA(state){
      console.log('getters----changeA',state);
    },
    /* changeB(state){
      return (a) => {
        console.log('getters----changeB',state,a,this);
      }
    } */
  },
  actions:{
    demoFun(){
      this.a++
      console.log('actions中的方法执行了',this);
    }
  }
})
