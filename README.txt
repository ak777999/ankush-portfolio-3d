ANKUSH 3D PORTFOLIO — README (Hinglish)
=======================================

Ye ek 3D (WebGL) portfolio website hai. Scroll karne se camera ek cyberpunk duniya mein udta hai:
  1) HERO       — glowing grid room + particles se bana 3D bust (scroll par vortex ban jata hai)
  2) SELECTED WORK — andheri gufa mein bade billboard screens par projects
  3) ABOUT      — server-room tunnel + terminal style text (typing effect)
  4) THE CITY   — skyscrapers ke beech neeche dive, laal portal ki taraf
  5) CONTACT    — Indian-cyberpunk bazaar gali (neon signs: चाय, ਲੁਧਿਆਣਾ, लस्सी ...)
Sab kuch code se bana hai — koi 3D model download nahi hota. three.js, GSAP aur fonts
assets/ folder ke andar hi hain, isliye internet ke bina bhi chalti hai.

1) WEBSITE KAISE KHOLEIN (localhost zaroori hai)
------------------------------------------------
   - Is folder (AnkushPortfolio3D) mein terminal / CMD kholo
   - Chalao:   python -m http.server 8081      (Mac/Linux: python3 -m http.server 8081)
   - Browser (Chrome/Edge) mein kholo:  http://localhost:8081
   NOTE: index.html par seedha double-click karne se NAHI chalegi, kyunki ES modules
         ko browser file:// se load nahi karta. Localhost ya GitHub Pages use karo.

2) CONTROLS
-----------
   - Mouse wheel / trackpad scroll  -> aage-peeche udna
   - Mobile par upar/neeche swipe    -> same
   - Arrow keys, PageUp/PageDown, Home/End bhi chalte hain
   - Top-right "LET'S TALK"  -> seedha contact scene
   - "SOUND OFF/ON"          -> halka synth ambient music (by default OFF)
   - Logo "ANKUSH" click     -> wapas shuru mein

3) TEXT / EMAIL / PROJECTS KAISE BADLEIN
---------------------------------------
SAARA text ek hi file mein hai:   assets/content.js
Notepad / VS Code se kholo, sirf "..." ke andar ka text badlo, save karo, browser refresh karo.
   name / city      -> logo aur naam
   heroLine         -> hero ka right side text (<em>..</em> = neela highlight)
   heroNote         -> "PLACEHOLDER ROLES" wali chhoti line — asli details daal ke hata dena
   projects         -> 5 billboards: title, type, year, colors [background, accent], motif
                       (motif: rings / stars / phone / wave / kites)
   projectNote      -> har project par "PLACEHOLDER PROJECT" tag — asli kaam aane par badlo
   aboutLines       -> terminal ki lines
   aboutMore/skills -> "LEARN MORE" popup ka text
   cityLine         -> city scene ki line
   contactTitle / contactButton / email -> contact scene (abhi email PLACEHOLDER: ankush@example.com)
   privacyText      -> "PRIVACY POLICY" popup
   footer           -> neeche right "DESIGN & DEV BY ANKUSH © 2026"
   signs            -> bazaar ke neon boards ka text (Hindi / Punjabi / English chalega)

4) PLACEHOLDERS (abhi sample hain)
---------------------------------
   - Ankush ka kaam/roles ("DIGITAL DESIGNER & CREATOR"), saare 5 projects, about text,
     skills, email (ankush@example.com) aur privacy text — sab sample hai.

5) FOLDER
---------
   index.html            -> page
   assets/content.js     -> SAARA TEXT (yahi badlo)
   assets/app.js         -> scroll, camera, post-processing (bloom, glitch), sound
   assets/world.js       -> 5 scenes ka 3D code
   assets/style.css      -> design
   assets/fonts/         -> Oswald, JetBrains Mono, Noto Devanagari, Noto Gurmukhi (offline)
   assets/vendor/        -> three.js r171 + addons, GSAP (offline copy)

6) TIPS
-------
   - Purane / kamzor phone par particles aur buildings automatic kam ho jaate hain.
   - Agar system mein "reduce motion" on hai to glitch effect band ho jata hai.
   - WebGL na ho to page simple scroll wale text page mein badal jata hai.
