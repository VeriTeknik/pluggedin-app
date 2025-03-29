import { NextRequest, NextResponse } from 'next/server';

// This is the incorrect pattern that would cause the error
// export async function PATCH(
//   request: NextRequest,
//   { params }: { params: { uuid: string } }
// ) {
//   const { uuid } = params; // This would fail since params is a Promise
//   // Rest of the function...
// }

// This is the correct pattern
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await params; // Correctly await the Promise
  // Rest of the function...
  
  return NextResponse.json({ message: 'Success', uuid });
}
