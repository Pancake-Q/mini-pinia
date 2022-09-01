import { getCurrentInstance, inject, toRaw, watch, unref, markRaw, effectScope, ref, isVue2, isRef, isReactive, set, onUnmounted, reactive, toRef, del, nextTick, computed, toRefs } from 'vue-demi';

// 计算属性得到的响应式对象是 ComputedRef，其原型上包含 effect 方法， 是通过 computed 注入的
function isComputed(o) {
  return !!(isRef(o) && o.effect);
}
// markRaw 作用： 标记一个对象，使其永远不会再成为响应式对象
// effectScope 作用： 返回一个作用域(副作用生效的作用域)，使用 run 方法收集响应式依赖，使用 stop 方法终止所有的副作用， 目的就是更方便的管理副作用的收集和销毁

let activePinia;

// pinia 实例
const setActivePinia = (pinia) => (activePinia = pinia)
// 首次加载的时候 没有pinia 的情况下 注入
const getActivePinia = () => (getCurrentInstance() && inject(piniaSymbol)) || activePinia;

const piniaSymbol = (process.env.NODE_ENV !== 'production') ? Symbol('pinia') : Symbol();

// 注册插件
function createPinia(){
  // 创建作用域空间
  const scope = effectScope(true)
  const state = scope.run(()=>ref({}))
  let _p = [] // 所有需要安装的插件
  console.log('pinia插件注入',state,'+++',scope);
  const pinia = markRaw({
    // 插件使用 install 作为入口
    install(app){
      pinia._a = app
      app.provide(piniaSymbol,pinia)
    },
    // 使用其他插件
    use(plugin){
      
    },
    state,
    _p, // 需要安装的插件
    _s: new Map(), // 保存处理后的store数据全部数据
    _e: scope, // 相应空间
    _a: null  // app实例，在install的时候会被设置
  })
  return pinia
}


function createOptionsStore(id,options,pinia){
  const { state, actions, getters } = options;
  // 初始化 state 存储， 第一次的时候 是 undefined
  const initState = pinia.state.value[id]
  console.log('pinia.state.value', pinia.state.value,options,initState);
  let store;
  //! 关键方法，createSetupStore 方法中调用这个方法， 拿到所有需要配置的 store 里面的 key， 进行针对性配置
  function setup(){
    if(!initState){
      // 添加 state
      pinia.state.value[id] = state ? state() : {};
    }
    // 通过一个新的 对象 避免直接操作 pinia.state.value , 使用 toRefs 展开引用
    const localState = toRefs(pinia.state.value[id]);
    // 合并 action
    return Object.assign(localState,actions,Object.keys(getters || {}).reduce((computedGetters,name)=>{
      computedGetters[name] = markRaw(computed(()=>{
        setActivePinia(pinia)
        const store = pinia._s.get(id)
        // 这里直接使用了 getters 中的方法， 返回一个改变了 this指向的原函数，并且把 store 实例传给了这个方法， 故在 getters 中可以接收一个参数就是 store， 并且不可以使用箭头函数
        return getters[name].call(store,store)
      }))
      return computedGetters
    },{}));
  }

  store = createSetupStore(id,setup,options,pinia)
    /* store.$reset = function $reset(){
    const newState = state ? state() : {};
    this.$patch(($state) => {
      assign($state,newState)
    })
  } */
  return store
}

function createSetupStore($id,setup,options,pinia){
  let scope
  // 获取配置项汇中的 state 是函数
  const buildState = options.state;
  // 获取 pinia 中当前的 store 第一次的时候是 undefined
  const initialState = pinia.state.value[$id];
  // 进行作用域包裹，获取需要处理的 store 中的 配置
  const setupStore = pinia._e.run(()=>{
    scope = effectScope();
    return scope.run(()=>setup())
  })

  const partialStore = {
    _p:pinia,
    $id
  }

  // store 在这里 被初始化为 reactive
  const store = reactive(partialStore)
  pinia._s.set($id,store)
  // 遍历配置 进行处理
  console.log(setupStore,"======setupStore======")
  for(const key in setupStore){
    const prop = setupStore[key]
    console.log('prop',key,'---',prop,isRef(prop),isComputed(prop),isReactive(prop));
    // 判断是否是 ref 的类型， 且是 getters 的类型， 这里处理选项中 getters
    if(isRef(prop) && !isComputed(prop)){
      //TODO 如果 state 没有值 进行处理 逻辑暂时没有细究
      if(!buildState){
        // 第一次 initialState 是 false 
        if(initialState){
          if(isRef(prop)){
            prop.value = initialState[key]
          }
        }else{
          pinia.state.value[$id][key] = prop;
        }
      }
    }else if (typeof prop === 'function'){
      //TODO 处理 actions 使用 源码中的wrapAction
      console.log('function',prop);
    }

  }
  //! 关键步骤， 改变 store 结构，将初始化的 store 平铺到源 store 上
  Object.assign(store,setupStore)
  Object.assign(toRaw(store),setupStore)
  Object.defineProperty(store,'_p',{
    enumerable:false
  })
  return store
}

/**
 * 
 * @param {*} idOptions  store id 一般为 string 标识本 store
 * @param {*} setup 配置项 { state，getters，actions...}
 * @param {*} setupOptions 
 */
function defineStore(idOptions,setup,setupOptions){
  let id;
  let options;
  // 获取配置项类型 当第二个参数传入的是函数的时候，则使用第三个参数为配置， 当只传入一个参数的时候， 则全部配置都包含在这个对象中
  const isSetupStore = typeof setup === 'function';
  // 获取 id 唯一值的类型 如果不是 string， 则获取 idOptions 中的 id
  if(typeof idOptions === 'string'){
    id = idOptions;
    options = isSetupStore ? setupOptions : setup
  } else {
    options = idOptions;
    id = idOptions.id
  }

  function useStore(pinia){
    // 获取当前实例
    const currentInstance = getCurrentInstance();
    // 通过 app 实例， 使用 inject 方法 引入 pinia
    pinia = currentInstance && inject(piniaSymbol)
    // 设置 pinia 没有实例的时候会走这里 设置当前活跃的是哪个pinia实例，当有多个pinia实例时，方便获取当前活跃的pinia实例 
    if(pinia) setActivePinia(pinia);
    pinia = getActivePinia()
    console.log('pinia111',pinia);
    if(!pinia._s.has(id)){
      // 第一次 map 上没有id 这里进行初始化, 挂载 store
      createOptionsStore(id,options,pinia)
    }
    // 读取 根 store
    const store = pinia._s.get(id);
    console.log('store',store,pinia);
    return store
  };
  useStore.$id = id;
  return useStore
}

export { createPinia, defineStore }

// 引用链接 pinia： https://www.jianshu.com/p/2acc2d043d35  https://juejin.cn/post/6984054351379562509?share_token=6aa96938-0531-4b45-876b-01b5a83b0a2d  effect scope： http://www.cncsto.com/article/56314

/**
 * 1. 全局注册 pinia API createPinia
 * 2. 在 store 默认配置 store API defineStore
 *    - 获取当前实例
 *    - 通过 app 实例使用 inject 引入 pinia
 *    - 设置当前活跃的 pinia 
 *    - 对唯一 id 进行 map 映射
 *    - 通过 createOptionsStore 传入配置 进行针对配置
 *    - createSetupStore 处理 setup
 * 3. 在 demo 使用store API useStore 
 */