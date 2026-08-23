export interface Book {
    id: string;
    title: string;
    subject: string;
    pages: number;
    readPages: number;
    cover?: string;
}

export interface StudyLog {
    id: string;
    bookId: string;
    subject: string;
    bookTitle: string;
    minutes: number;
    pagesRead: number;
    date: string;
    timestamp: number;
}

export interface Goal {
    id: string;
    title: string;
    emoji: string;
    targetDate: string;
    daysLeft: number;
    progress: number;
    color: string;
}

export interface StudyGroup {
    id: string;
    name: string;
    emoji: string;
    members: number;
    online: number;
    active: boolean;
}

export interface StudyPartner {
    id: string;
    name: string;
    initials: string;
    exam: string;
    streak: number;
    online: boolean;
    color: string;
}

export interface FeedPost {
    id: string;
    author: string;
    initials: string;
    color: string;
    content: string;
    group: string;
    timeAgo: string;
    likes: number;
    comments: number;
    liked: boolean;
}

export interface StoreItem {
    id: string;
    title: string;
    subject: string;
    price: number;
    pages: number;
}