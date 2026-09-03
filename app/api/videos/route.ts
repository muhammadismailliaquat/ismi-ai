import { NextResponse } from 'next/server';
import { readdirSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const VIDEO_EXT = ['.mp4', '.webm', '.mov', '.m4v', '.mkv'];

// Lists the anime edit videos the user drops into public/videos/ so the
// gallery stays in sync automatically (no manifest to edit by hand).
export async function GET() {
  const dir = path.join(process.cwd(), 'public', 'videos');
  try {
    const files = readdirSync(dir)
      .filter((f) => VIDEO_EXT.includes(path.extname(f).toLowerCase()))
      .sort();
    return NextResponse.json({ videos: files.map((f) => `/videos/${f}`) });
  } catch {
    return NextResponse.json({ videos: [] });
  }
}
