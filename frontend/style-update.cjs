const fs = require('fs');
const path = require('path');

const files = [
  'src/features/dashboard/Dashboard.tsx',
  'src/features/incidents/IncidentsPage.tsx',
  'src/features/incidents/IncidentDetail.tsx',
  'src/components/ui/data-table.tsx',
  'src/components/ui/metrics-chart.tsx'
];

const OUTER_BG_OLD = /<div className="space-y-6 relative z-0 bg-\[#060911\] p-6 rounded-3xl overflow-hidden">\s*<div className="absolute inset-0 bg-\[rgba\(99,102,241,0\.08\)\] blur-\[140px\] pointer-events-none -z-10" \/>/g;
const OUTER_BG_NEW = `<div className="bg-black min-h-screen text-white p-6 relative overflow-hidden space-y-6">\n      <div className="absolute top-0 left-[10%] right-[10%] w-[80%] h-full z-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #206ce8 0%, transparent 70%)', opacity: 0.25, mixBlendMode: 'screen' }} />`;

const CARD_OLD = /backdrop-blur-xl bg-neutral-950\/70 border border-white\/10 shadow-\[0_16px_40px_0_rgba\(0,0,0,0\.5\)\] rounded-2xl p-6/g;
const CARD_NEW = `bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-800 text-white rounded-2xl p-6 shadow-xl relative z-10`;

const PAGE_HEADER_OLD = /text-3xl font-bold bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent/g;
const PAGE_HEADER_NEW = `text-3xl font-bold tracking-tight text-white relative z-10`;

const SECTION_HEADER_OLD = /text-xl font-bold bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent/g;
const SECTION_HEADER_NEW = `text-3xl font-bold tracking-tight text-white relative z-10`;

const BADGE_OLD = /rounded-full border border-indigo-500\/30 bg-indigo-500\/10 px-3 py-1 text-xs text-indigo-300 font-medium/g;
const BADGE_NEW = `rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-400 font-medium`;

const BUTTON_PRIMARY_OLD = /px-4 py-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl shadow-\[0_0_20px_rgba\(99,102,241,0\.35\)\] transition-all/g;
const BUTTON_PRIMARY_NEW = `bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-900/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2 hover:from-blue-600 hover:to-blue-700 transition-all`;

const BUTTON_OUTLINE_OLD = /px-3 py-1 text-sm bg-white\/10 rounded disabled:opacity-50 hover:bg-white\/20 transition-colors/g;
const BUTTON_OUTLINE_NEW = `bg-gradient-to-t from-neutral-950 to-neutral-800 border border-neutral-700 text-white font-medium rounded-xl px-4 py-2 hover:from-neutral-900 hover:to-neutral-700 transition-all disabled:opacity-50`;

for (const f of files) {
  const p = path.join('/Users/abuzar/Desktop/Astrawatch/frontend', f);
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, 'utf8');
    
    content = content.replace(OUTER_BG_OLD, OUTER_BG_NEW);
    content = content.replace(CARD_OLD, CARD_NEW);
    content = content.replace(PAGE_HEADER_OLD, PAGE_HEADER_NEW);
    content = content.replace(SECTION_HEADER_OLD, SECTION_HEADER_NEW);
    content = content.replace(BADGE_OLD, BADGE_NEW);
    content = content.replace(BUTTON_PRIMARY_OLD, BUTTON_PRIMARY_NEW);
    content = content.replace(BUTTON_OUTLINE_OLD, BUTTON_OUTLINE_NEW);
    
    if (f.includes('data-table.tsx')) {
      content = content.replace(
        /w-full text-white bg-\[#060911\]\/50 backdrop-blur-md rounded-xl p-4 shadow-lg border border-white\/5/g,
        'w-full text-white bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl relative z-10'
      );
      content = content.replace(/focus:ring-indigo-500/g, 'focus:ring-blue-500');
    }
    
    if (f.includes('metrics-chart.tsx')) {
      content = content.replace(/#0ea5e9/g, '#206ce8');
      content = content.replace(/#6366f1/g, '#206ce8');
      content = content.replace(/rgba\(14, 165, 233, 0\.3\)/g, 'rgba(32, 108, 232, 0.3)');
      content = content.replace(/rgba\(99, 102, 241, 0\.01\)/g, 'rgba(32, 108, 232, 0.01)');
      content = content.replace(/backgroundColor: '#060911'/g, "backgroundColor: 'transparent'");
      content = content.replace(/bg-\[#060911\]/g, 'bg-black');
    }

    fs.writeFileSync(p, content, 'utf8');
    console.log('Updated ' + f);
  }
}
