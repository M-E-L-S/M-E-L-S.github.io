import load from './vendor/rules.mjs';
export async function loadRules() {
  const m=await load();
  function observe(info,pending,tensors) {
    const result=JSON.parse(m.ccall('observe','string',['string','string','number'],[info,pending,tensors]));
    if(!result) throw Error('Invalid card state');
    return result;
  }
  return {
    observe:(info,pending='')=>observe(info,pending,1),
    actions:(info,pending='')=>observe(info,pending,0).actions,
    valid(history) {
      return Boolean(m.ccall('valid','number',['string'],[history]));
    }
  };
}
