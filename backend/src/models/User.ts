import mongoose, { Schema, Document } from 'mongoose';

export interface UserDocument extends Document {
    email: string;
    passwordHash: string;
    plan: 'free' | 'pro' | 'enterprise';
    emailVerified: boolean;
    createdAt: Date;
}

const UserSchema = new Schema<UserDocument>(
    {
        email: { 
            type: String, 
            required: true, 
            unique: true, 
            lowercase: true, 
            match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ 
        },
        passwordHash: { type: String, required: true },
        plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
        emailVerified: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
    }
);

export const User = mongoose.model<UserDocument>('User', UserSchema);
