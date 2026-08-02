const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

walkDir('./src', (filePath) => {
    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    let updatedContent = content.replace(/import\s*\{\s*([a-zA-Z0-9_]+)\s*\}\s*from\s*['"](@\/components\/ui\/[^'"]+)['"];/g, (match, p1, p2) => {
        const knownIcons = ['shield-check', 'down-chevron', 'right-chevron', 'question-mark', 'gear', 'CodeIcon'];
        if (p2.endsWith('-icon') || knownIcons.some(name => p2.endsWith('/' + name))) {
            return `import ${p1} from '${p2}';`;
        }
        return match;
    });
    
    if (content !== updatedContent) {
        fs.writeFileSync(filePath, updatedContent);
        console.log(`Updated ${filePath}`);
    }
});
