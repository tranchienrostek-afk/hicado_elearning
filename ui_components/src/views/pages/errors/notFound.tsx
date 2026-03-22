import { Link } from 'react-router-dom';

export const NotFound = () => {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-6 sm:w-[350px]">
      <h1 className="text-6xl font-bold text-white/20">404</h1>
      <h5 className="text-xl text-white">Không tìm thấy trang</h5>
      <Link to="/home" className="mt-4 text-emerald-400 hover:text-emerald-300 transition-colors underline decoration-2 underline-offset-4">
        Quay lại Trang chủ
      </Link>
    </div>
  );
};
