<template>
  <h1>测试页面</h1>
  <div>
    <h1>{{count}}</h1>
    <button @click="clickHandle">加1</button>
  </div>
</template>

<script>
import { computed } from '@vue/runtime-core';
import { mainStore } from './../store/index'

export default {
  setup() {
    const store = mainStore()
    console.log('结果',store);
    const clickHandle = () => {
      console.log('点击事件');
      store.demoFun()
    }
    const count = computed(()=>{
      return store.a
    })
    return{
      count,
      clickHandle
    }
  },
}
</script>