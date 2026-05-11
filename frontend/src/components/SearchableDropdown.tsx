import React, { useState, useEffect, useRef } from 'react';
import { Loader2, ChevronDown } from 'lucide-react';
import './SearchableDropdown.css';

interface Props {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;
}

const SearchableDropdown: React.FC<Props> = ({ label, value, onChange, options, placeholder = "Select...", isLoading = false, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // Reset search term to value if clicked outside
        setSearchTerm(value);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value]);

  const filteredOptions = options.filter(opt => 
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="searchable-dropdown form-group" ref={wrapperRef}>
      <label>{label}</label>
      <div className={`dropdown-input-wrapper ${disabled ? 'disabled' : ''}`}>
        <input 
          type="text" 
          className="input-field dropdown-input"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            if (!disabled) {
              setSearchTerm('');
              setIsOpen(true);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
        />
        <div className="dropdown-icon" onClick={() => !disabled && setIsOpen(!isOpen)}>
          {isLoading ? <Loader2 className="spinner" size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {isOpen && !disabled && (
        <ul className="dropdown-list glass-panel">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, idx) => (
              <li 
                key={idx} 
                className="dropdown-item"
                onClick={() => {
                  onChange(opt);
                  setSearchTerm(opt);
                  setIsOpen(false);
                }}
              >
                {opt}
              </li>
            ))
          ) : (
            <li className="dropdown-item empty">
              {isLoading ? "Loading..." : "No options found"}
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default SearchableDropdown;
