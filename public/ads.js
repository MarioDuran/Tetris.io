/* Optional intermission advertising: disabled until approved client AND slot exist.
   AdSense policy, consent and publisher approval remain the site owner's responsibility. */
(() => {
  const config=window.QUADRIFT_CONFIG||{};
  if(!/^ca-pub-\d{12,22}$/.test(config.adsClient||'') || !/^\d{8,20}$/.test(config.adsSlot||''))return;
  window.addEventListener('quadrift:break',()=>{
    const holder=document.getElementById('adPlacement'),wrapper=document.getElementById('adBreak');
    if(!holder||!wrapper||holder.dataset.loaded)return;
    // Do not initialize personalized ads without the appropriate consent / CMP.
    // A production integration must implement the applicable Google consent flow here.
    if(window.QUADRIFT_AD_CONSENT!==true)return;
    holder.dataset.loaded='1';wrapper.hidden=false;
    const script=document.createElement('script');script.async=true;
    script.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+encodeURIComponent(config.adsClient);
    script.crossOrigin='anonymous';document.head.append(script);
    const ins=document.createElement('ins');ins.className='adsbygoogle';ins.style.display='block';
    ins.dataset.adClient=config.adsClient;ins.dataset.adSlot=config.adsSlot;ins.dataset.adFormat='auto';
    ins.dataset.fullWidthResponsive='true';holder.append(ins);
    script.addEventListener('load',()=>{(window.adsbygoogle=window.adsbygoogle||[]).push({});});
  });
})();
