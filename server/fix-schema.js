const fs = require('fs');
const filePath = 'src/database/schema.ts';

let content = fs.readFileSync(filePath, 'utf8');
const before = content;

// Fixes `.$type` that's missing its opening `<` before a multi-line object type
content = content.replace(/\.\$type(\s*\r?\n\s*\{)/g, '.$type<$1');

if (content === before) {
  console.log('No changes made — pattern not found. File may already be fixed, or the bug looks different than expected.');
} else {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Patched schema.ts successfully.');
}