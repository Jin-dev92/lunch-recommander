import { assertEquals } from 'jsr:@std/assert';
import { createNearbyHandler } from './index.ts';

Deno.test('사용량 초과는 429입니다', async () => {
  const handler = createNearbyHandler({ authenticate:async()=>({id:'u1'}), checkLimit:async()=>false, findCached:async()=>[], fetchGoogle:async()=>[], upsert:async()=>{} });
  const response = await handler(new Request('http://local',{method:'POST',headers:{authorization:'Bearer jwt','x-forwarded-for':'127.0.0.1'},body:JSON.stringify({lat:37,lng:127,radius:500})}));
  assertEquals(response.status,429);
});
Deno.test('캐시 히트 시 Google을 호출하지 않습니다', async () => {
  let googleCalls=0;
  const cached=[{placeId:'p1',name:'식당',category:'한식',lat:37,lng:127,googleRating:4,googleRatingsTotal:20,distanceMeters:10}];
  const handler=createNearbyHandler({authenticate:async()=>({id:'u1'}),checkLimit:async()=>true,findCached:async()=>cached,fetchGoogle:async()=>{googleCalls++;return[];},upsert:async()=>{}});
  const response=await handler(new Request('http://local',{method:'POST',headers:{authorization:'Bearer jwt','x-forwarded-for':'127.0.0.1'},body:JSON.stringify({lat:37,lng:127,radius:500})}));
  assertEquals(response.status,200); assertEquals(googleCalls,0); assertEquals((await response.json()).source,'cache');
});
Deno.test('JWT가 없으면 401입니다', async () => {
  const handler=createNearbyHandler({authenticate:async()=>({id:'u1'}),checkLimit:async()=>true,findCached:async()=>[],fetchGoogle:async()=>[],upsert:async()=>{}});
  const response=await handler(new Request('http://local',{method:'POST',headers:{'x-forwarded-for':'127.0.0.1'},body:JSON.stringify({lat:37,lng:127,radius:500})}));
  assertEquals(response.status,401);
});
