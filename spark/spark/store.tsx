import { Book, StudyLog, Goal, StudyGroup, StudyPartner, FeedPost, StoreItem } from './types';

export const seedBooks: Book[] = [
    { id: 'b1', title: 'Concepts of Physics Vol.1', subject: 'Physics', pages: 342, readPages: 222 },
    { id: 'b2', title: 'Concepts of Physics Vol.2', subject: 'Physics', pages: 376, readPages: 45 },
    { id: 'b3', title: 'Organic Chemistry', subject: 'Chemistry', pages: 512, readPages: 164 },
    { id: 'b4', title: 'Physical Chemistry', subject: 'Chemistry', pages: 480, readPages: 89 },
    { id: 'b5', title: 'Mathematics Class 12', subject: 'Mathematics', pages: 480, readPages: 230 },
    { id: 'b6', title: 'Mathematics Class 11', subject: 'Mathematics', pages: 462, readPages: 310 },
    { id: 'b7', title: 'Indian Polity', subject: 'Polity', pages: 624, readPages: 137 },
    { id: 'b8', title: 'Modern India (Spectrum)', subject: 'History', pages: 420, readPages: 380 },
    { id: 'b9', title: 'NCERT Biology', subject: 'Biology', pages: 380, readPages: 290 },
    { id: 'b10', title: 'RS Aggarwal Quant', subject: 'Aptitude', pages: 850, readPages: 120 },
];

export const seedLogs: StudyLog[] = [
    { id: 'l1', bookId: 'b1', subject: 'Physics', bookTitle: 'Concepts of Physics Vol.1', minutes: 45, pagesRead: 12, date: '2026-08-19', timestamp: Date.now() - 7200000 },
    { id: 'l2', bookId: 'b5', subject: 'Mathematics', bookTitle: 'Mathematics Class 12', minutes: 80, pagesRead: 8, date: '2026-08-19', timestamp: Date.now() - 18000000 },
    { id: 'l3', bookId: 'b3', subject: 'Chemistry', bookTitle: 'Organic Chemistry', minutes: 55, pagesRead: 15, date: '2026-08-18', timestamp: Date.now() - 86400000 },
    { id: 'l4', bookId: 'b7', subject: 'Polity', bookTitle: 'Indian Polity', minutes: 30, pagesRead: 6, date: '2026-08-17', timestamp: Date.now() - 172800000 },
    { id: 'l5', bookId: 'b1', subject: 'Physics', bookTitle: 'Concepts of Physics Vol.1', minutes: 60, pagesRead: 14, date: '2026-08-17', timestamp: Date.now() - 170000000 },
];

export const seedGoals: Goal[] = [
    { id: 'g1', title: 'JEE Main 2027', emoji: '🎯', targetDate: '2027-01-15', daysLeft: 162, progress: 38, color: '#3b82f6' },
    { id: 'g2', title: 'NEET 2027', emoji: '🧬', targetDate: '2027-05-05', daysLeft: 252, progress: 22, color: '#22c55e' },
    { id: 'g3', title: 'UPSC CSE Prelims 2026', emoji: '🏛️', targetDate: '2026-05-25', daysLeft: 287, progress: 55, color: '#f59e0b' },
    { id: 'g4', title: 'CA Final Group 1', emoji: '📊', targetDate: '2026-11-20', daysLeft: 105, progress: 45, color: '#a855f7' },
];

export const seedGroups: StudyGroup[] = [
    { id: 'gr1', name: 'JEE 2027 Warriors', emoji: '🚀', members: 1240, online: 86, active: true },
    { id: 'gr2', name: 'NEET Cracker', emoji: '🧬', members: 856, online: 32, active: false },
    { id: 'gr3', name: 'UPSC Aspirants', emoji: '🏛️', members: 2430, online: 142, active: true },
    { id: 'gr4', name: 'CA Final Group', emoji: '📊', members: 412, online: 8, active: false },
    { id: 'gr5', name: 'Bank PO Aimers', emoji: '🏦', members: 1890, online: 67, active: true },
];

export const seedPartners: StudyPartner[] = [
    { id: 'p1', name: 'Rahul P.', initials: 'RP', exam: 'JEE', streak: 14, online: true, color: '#3b82f6' },
    { id: 'p2', name: 'Sneha K.', initials: 'SK', exam: 'NEET', streak: 8, online: false, color: '#22c55e' },
    { id: 'p3', name: 'Arjun V.', initials: 'AV', exam: 'UPSC', streak: 21, online: true, color: '#f59e0b' },
    { id: 'p4', name: 'Priya M.', initials: 'PM', exam: 'CA Final', streak: 5, online: false, color: '#a855f7' },
    { id: 'p5', name: 'Vikram S.', initials: 'VS', exam: 'JEE', streak: 30, online: true, color: '#ef4444' },
];

export const seedFeed: FeedPost[] = [
    { id: 'f1', author: 'Rahul P.', initials: 'RP', color: '#3b82f6', content: 'completed Physics — Rotational Mechanics', group: 'JEE 2027 Warriors', timeAgo: '2h ago', likes: 24, comments: 5, liked: false },
    { id: 'f2', author: 'Sneha K.', initials: 'SK', color: '#22c55e', content: 'hit a 30-day streak 🔥', group: 'NEET Cracker', timeAgo: '4h ago', likes: 56, comments: 12, liked: true },
    { id: 'f3', author: 'Arjun V.', initials: 'AV', color: '#f59e0b', content: 'finished Laxmikant Ch. 12', group: 'UPSC Aspirants', timeAgo: '6h ago', likes: 18, comments: 3, liked: false },
    { id: 'f4', author: 'Vikram S.', initials: 'VS', color: '#ef4444', content: 'solved 50 problems today!', group: 'JEE 2027 Warriors', timeAgo: '8h ago', likes: 42, comments: 8, liked: false },
];

export const seedStore: StoreItem[] = [
    { id: 's1', title: 'Spectrum — Modern India', subject: 'UPSC', price: 199, pages: 420 },
    { id: 's2', title: 'RS Aggarwal Quantitative Aptitude', subject: 'Bank/SSC', price: 249, pages: 850 },
    { id: 's3', title: 'OP Tandon Physical Chemistry', subject: 'JEE', price: 349, pages: 480 },
    { id: 's4', title: 'NCERT Exemplar Physics', subject: 'JEE/NEET', price: 149, pages: 280 },
];

export const examOptions = [
    'JEE Main', 'JEE Advanced', 'NEET', 'UPSC CSE', 'CA Foundation',
    'CA Intermediate', 'CA Final', 'GATE', 'CLAT', 'NDA', 'CUET',
    'CAT', 'Bank PO (IBPS/SBI)', 'SSC CGL', 'State PSC',
    'JLPT N5/N4/N3/N2/N1', 'Other'
];

export const subjectOptions = [
    'Physics', 'Chemistry', 'Mathematics', 'Biology',
    'Polity (UPSC)', 'History (UPSC)', 'Economics',
    'Accounts (CA)', 'English', 'Logical Reasoning', 'Aptitude'
];

export const bookOptions = [
    'HC Verma Vol.1', 'HC Verma Vol.2', 'OP Tandon Organic',
    'OP Tandon Physical', 'RD Sharma Class 11', 'RD Sharma Class 12',
    'NCERT Biology', 'Laxmikant Polity', 'Spectrum History',
    'RS Aggarwal Quant', 'NCERT Exemplar', 'Other'
];