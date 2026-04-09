
import fs from 'fs';

const content = fs.readFileSync('./src/questionBank.ts', 'utf-8');
const match = content.match(/export const QUESTION_BANK: Question\[\] = (\[[\s\S]*?\]);/);
if (!match) {
    console.error('Could not find QUESTION_BANK');
    process.exit(1);
}

// We need to evaluate the array. Since it's TS, we might need a simple parser or just use regex for basic checks.
// But let's try a simpler approach: use regex to extract each object.

const questionsRaw = match[1];
const questionRegex = /\{[\s\S]*?id: (\d+)[\s\S]*?\}/g;
let qMatch;
const questions = [];

while ((qMatch = questionRegex.exec(questionsRaw)) !== null) {
    const qStr = qMatch[0];
    const id = parseInt(qMatch[1]);
    
    // Extract title
    const titleMatch = qStr.match(/title: ['"](.*?)['"]/);
    const title = titleMatch ? titleMatch[1] : '';
    
    // Extract options
    const optionsMatch = qStr.match(/options: \[(.*?)\]/);
    const options = optionsMatch ? optionsMatch[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')) : [];
    
    // Extract answer
    const answerMatch = qStr.match(/answer: (['"].*?['"]|\[.*?\])/);
    let answer = answerMatch ? answerMatch[1] : '';
    if (answer.startsWith('[') && answer.endsWith(']')) {
        answer = answer.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
    } else {
        answer = answer.replace(/^['"]|['"]$/g, '');
    }
    
    const typeMatch = qStr.match(/type: ['"](.*?)['"]/);
    const type = typeMatch ? typeMatch[1] : '';

    questions.push({ id, title, options, answer, type, raw: qStr });
}

console.log(`Found ${questions.length} questions.`);

// 1. Check for duplicate titles
const titles = new Map();
questions.forEach(q => {
    if (titles.has(q.title)) {
        console.log(`Duplicate title: "${q.title}" (IDs: ${titles.get(q.title)}, ${q.id})`);
    } else {
        titles.set(q.title, q.id);
    }
});

// 2. Check for duplicate options within a question
questions.forEach(q => {
    if (q.type === 'single' || q.type === 'multiple') {
        const seen = new Set();
        q.options.forEach(opt => {
            if (seen.has(opt)) {
                console.log(`Duplicate option in ID ${q.id}: "${opt}"`);
            }
            seen.add(opt);
        });
    }
});

// 3. Check if answer is in options
questions.forEach(q => {
    if (q.type === 'single') {
        if (!q.options.includes(q.answer)) {
            console.log(`Answer not in options for ID ${q.id}: Answer="${q.answer}", Options=[${q.options.join(', ')}]`);
        }
    } else if (q.type === 'multiple') {
        const ansArr = Array.isArray(q.answer) ? q.answer : [q.answer];
        ansArr.forEach(ans => {
            if (!q.options.includes(ans)) {
                console.log(`Answer part not in options for ID ${q.id}: AnswerPart="${ans}", Options=[${q.options.join(', ')}]`);
            }
        });
    }
});
