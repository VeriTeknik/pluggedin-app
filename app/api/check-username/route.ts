import { NextRequest, NextResponse } from 'next/server';
import { checkUsernameAvailability } from '@/app/actions/social';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');

  if (!username) {
    return NextResponse.json(
      { available: false, message: 'Username is required' },
      { status: 400 }
    );
  }

  try {
    const availability = await checkUsernameAvailability(username);
    return NextResponse.json(availability);
  } catch (error) {
    console.error('Error checking username availability:', error);
    return NextResponse.json(
      { 
        available: false, 
        message: 'An error occurred while checking username availability' 
      },
      { status: 500 }
    );
  }
} 