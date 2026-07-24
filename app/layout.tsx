import Providers from './providers';
import './globals.css';

// Google Maps 스크립트는 지도를 쓰는 화면에서만 필요하고, 로드 완료 시점을 알아야
// 초기화 레이스를 피할 수 있다. 그래서 전역이 아니라 components/Map.tsx에서 불러온다.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
