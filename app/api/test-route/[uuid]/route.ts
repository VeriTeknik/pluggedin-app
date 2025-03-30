import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await params;
  
  return NextResponse.json({ message: 'Successfully parsed parameters', uuid });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await params;
  
  try {
    const body = await request.json();
    
    return NextResponse.json({ 
      message: 'Successfully processed request', 
      uuid,
      body
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to process request', details: error.message },
      { status: 500 }
    );
  }
}
