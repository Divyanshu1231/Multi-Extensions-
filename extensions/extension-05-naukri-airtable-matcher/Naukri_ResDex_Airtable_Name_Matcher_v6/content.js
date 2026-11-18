(() => {
  if (window.__naukriMatcherV6) return;
  window.__naukriMatcherV6 = true;
  const NAME_SELECTOR = 'div.candidate-headline a.candidate-name';
  const norm = s => (s || '').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  function visible(el) {
    if (!el || !el.isConnected || !el.getClientRects().length) return false;
    for (let p=el; p && p!==document.documentElement; p=p.parentElement) {
      const s=getComputedStyle(p);
      if (s.display==='none' || s.visibility==='hidden' || p.hidden || p.getAttribute('aria-hidden')==='true') return false;
    }
    return true;
  }
  function getCandidates() {
    const out=[], seen=new Set();
    // Do not search arbitrary headings, body text, profile descriptions, or hidden elements.
    for (const a of document.querySelectorAll(NAME_SELECTOR)) {
      if (!visible(a)) continue;
      const name=(a.innerText || a.textContent || a.getAttribute('title') || '').replace(/\s+/g,' ').trim();
      if (!name) continue;
      const url=a.href || a.getAttribute('href') || '';
      // Same profile URL is a repeated DOM occurrence; same name with different URLs remains separate.
      const key=url ? new URL(url,location.href).href : `${name}::${out.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({name, profileUrl:url ? new URL(url,location.href).href : '', phone:''});
    }
    return out;
  }
  function pageInfo(){const m=(document.body.innerText||'').match(/Page\s+(\d+)\s+of\s+(\d+)/i);return m?{current:+m[1],total:+m[2]}:null;}
  function findNext(){
    const visibleEls=[...document.querySelectorAll('button,a,[role="button"]')].filter(visible);
    const explicit=visibleEls.find(el=>{const t=`${el.innerText||''} ${el.getAttribute('aria-label')||''} ${el.title||''}`.trim().toLowerCase();return !el.disabled&&el.getAttribute('aria-disabled')!=='true'&&(t==='next'||t.includes('next page')||t.includes('go to next'));});
    if(explicit)return explicit;
    const label=[...document.querySelectorAll('body *')].find(el=>el.children.length<=2&&/^Page\s+\d+\s+of\s+\d+$/i.test((el.innerText||'').trim()));
    if(label){let root=label.parentElement;for(let i=0;i<4&&root;i++,root=root.parentElement){const cs=[...root.querySelectorAll('button,a,[role="button"]')].filter(el=>visible(el)&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&(['›','❯','>','→'].includes((el.innerText||'').trim())||(el.getAttribute('aria-label')||'').toLowerCase().includes('next')));if(cs.length)return cs[cs.length-1];}}
    return null;
  }
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function waitChange(url,before,page){for(let i=0;i<40;i++){await sleep(300);const now=getCandidates(),p=pageInfo();if(location.href!==url||(page&&p&&p.current!==page.current)||(now.length&&now.map(x=>x.profileUrl||x.name).join('|')!==before.map(x=>x.profileUrl||x.name).join('|'))){await sleep(700);return true;}}return false;}
  chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
    if(msg.action==='collectNames'){const cs=getCandidates();reply({candidates:cs,names:cs.map(x=>x.name),cardsDetected:document.querySelectorAll(NAME_SELECTOR).length,visibleNameLinks:cs.length,pager:pageInfo(),url:location.href});return true;}
    if(msg.action==='scanPages'){
      (async()=>{const max=Math.min(Math.max(Number(msg.maxPages)||100,1),200),all=[],seenPages=new Set();let pages=0;
        for(let i=0;i<max;i++){const p=pageInfo(),pageKey=p?`${location.pathname}|${p.current}`:location.href;if(seenPages.has(pageKey))break;seenPages.add(pageKey);const current=getCandidates();all.push(...current);pages++;
          chrome.runtime.sendMessage({type:'scanProgress',pages,candidates:all,status:`Page ${p?.current??pages}/${p?.total??'?'}: ${current.length} visible candidate cards; ${new Set(all.map(x=>x.profileUrl||norm(x.name))).size} profiles so far.`}).catch(()=>{});
          if(p&&p.current>=p.total)break;const next=findNext();if(!next)break;const url=location.href;next.click();if(!await waitChange(url,current,p))break;
        }
        const map=new Map();for(const c of all){const key=c.profileUrl||`${norm(c.name)}::no-url`;if(!map.has(key))map.set(key,c);else if(!map.get(key).phone&&c.phone)map.get(key).phone=c.phone;}
        chrome.runtime.sendMessage({type:'scanFinished',pages,candidates:[...map.values()],status:`Scan finished: ${pages} page(s), ${map.size} distinct profile entries. Same-name profiles with different URLs are kept.`}).catch(()=>{});
      })().catch(e=>chrome.runtime.sendMessage({type:'scanError',status:String(e)}).catch(()=>{}));reply({started:true});return true;
    }
  });
})();