export function sample() {
  const models = 'Ioniq 5\nElexio EV\nInster EV\nTucson HEV\nKona HEV\nSantaFe HEV\nPalisade HEV';
  const param = (key, values) => ({key, values});
  const country = () => param('Country', 'Australia');
  const templates = [
    ['recommend', '차량 추천', 'What is the best {Category} to buy in {Country} right now?'],
    ['compare', '차량 비교', 'How does Hyundai {Hyundai} compare to {Other} in {Country}?'],
    ['alternative', '대안 추천', "In {Country}, I'm looking at {Model} but want to explore other options — what would you recommend for now?"],
    ['pros', '장단점 탐색', 'What are the pros and cons of Hyundai {Model} to buy in {Country} for now?'],
  ];
  return {version: 1, dedupe: true, parameterSets: [
    {id:'p-recommend',name:'호주 · 추천 카테고리',mode:'product',params:[country(),param('Category','car\nSUV\nEV\nfamily car')]},
    {id:'p-compare',name:'호주 · 차량 비교 짝',mode:'zip',params:[country(),param('Hyundai','SUV\nEV\nTucson\nIoniq 5'),param('Other','Toyota SUV\nBYD EV\nToyota rav4\nTesla Model Y')]},
    {id:'p-alternative',name:'호주 · 대안 탐색 모델',mode:'product',params:[country(),param('Model','Toyota rav4\nTesla Model Y\nBYD Sealion 7')]},
    {id:'p-pros',name:'호주 · 장단점 대상',mode:'product',params:[country(),param('Model','Kona\nTucson\nSUV\nEV')]},
    {id:'p-extra',name:'호주 · 현대차 7개 모델',mode:'product',params:[country(),param('Model',models)]},
  ], templateSets: [
    ...templates.map(([id,name,text]) => ({id:'s-'+id,name,enabled:true,parameterSetIds:['p-'+id],templates:[{id:'t-'+id,name,text,enabled:true}]})),
    {id:'s-extra',name:'현대차 추가 질문',enabled:true,parameterSetIds:['p-extra'],templates: templates.slice(2).map(([id,name,text]) => ({id:'t-extra-'+id,name,text,enabled:true}))},
  ]};
}
