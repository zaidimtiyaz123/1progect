'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CartItem = { id:string; name:string; price:number; image?:string; qty:number; note?:string };
type Store = {
  items: CartItem[]; tableToken?:string; tableLabel?:string;
  add:(it: Omit<CartItem,'qty'> & {qty?:number})=>void;
  remove:(id:string)=>void;
  inc:(id:string)=>void; dec:(id:string)=>void;
  clear:()=>void; setTable:(token:string,label:string)=>void;
  total:()=>number; count:()=>number;
};
export const useCart = create<Store>()(persist((set,get)=>({
  items:[], tableToken:undefined, tableLabel:undefined,
  add:(it)=> set(s=>{
    const ex=s.items.find(x=>x.id===it.id);
    if(ex) return {items:s.items.map(x=>x.id===it.id?{...x, qty: x.qty + (it.qty||1)}:x)};
    return {items:[...s.items,{...it, qty: it.qty||1}]};
  }),
  remove:(id)=> set(s=>({items:s.items.filter(x=>x.id!==id)})),
  inc:(id)=> set(s=>({items:s.items.map(x=>x.id===id?{...x,qty:x.qty+1}:x)})),
  dec:(id)=> set(s=>({items:s.items.map(x=>x.id===id?{...x,qty:Math.max(1,x.qty-1)}:x)})),
  clear:()=> set({items:[]}),
  setTable:(token,label)=> set({tableToken:token, tableLabel:label}),
  total:()=> get().items.reduce((a,b)=>a+b.price*b.qty,0),
  count:()=> get().items.reduce((a,b)=>a+b.qty,0),
}),{name:'cart-v1'}));
