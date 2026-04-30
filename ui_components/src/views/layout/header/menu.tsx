import { useState } from 'react';
import { useAuthStore } from '@/store';
import { Dropdown } from '.';

export const HeaderMenu = () => {
  const { auth } = useAuthStore();
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <ul className="inline-flex shrink-0 items-center">
      <li className="relative">
        <button
          className="relative flex items-center gap-2"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <div className="w-[35px] h-[35px] rounded-full bg-hicado-navy flex items-center justify-center text-white font-black text-sm shadow-[0_0_16px_-8px] shadow-black/25">
            {auth?.name?.charAt(0) ?? '?'}
          </div>
          <i className="icon-down text-xl"></i>
        </button>
        <Dropdown show={showDropdown} />
      </li>
    </ul>
  );
};
