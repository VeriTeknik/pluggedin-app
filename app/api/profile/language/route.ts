import { NextResponse } from 'next/server';

import { getActiveProfileLanguage } from '@/app/actions/profiles';

export async function GET() {
  try {
    const language = await getActiveProfileLanguage();
    return NextResponse.json({ language });
  } catch (error) {
    console.error('Error fetching profile language:', error);
    return NextResponse.json({ language: null });
  }
}