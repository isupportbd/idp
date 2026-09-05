import { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../../api/client';
import { Search, ChevronDown } from 'lucide-react';


export default function SalesRatesManager() {
  const [salesRates, setSalesRates] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  
  const [clientFormSearchResults, setClientFormSearchResults] = useState<any[]>([]);
  const [isSearchingFormClients, setIsSearchingFormClients] = useState(false);
  
  const [clientFilterSearchResults, setClientFilterSearchResults] = useState<any[]>([]);
  
  const [items, setItems] = useState<any[]>([]);
  const [clientPurchasedItems, setClientPurchasedItems] = useState<any[]>([]);
  const [unitConversions, setUnitConversions] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentEditingId, setCurrentEditingId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const todayDate = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    clientId: '',
    itemId: '',
    salesRate: '',
    vatRate: '',
    additionPercent: '',
    unitId: '',
    activationDate: todayDate
  });

  const [clientSearchText, setClientSearchText] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  const [itemSearchText, setItemSearchText] = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);

  const [showUnitDropdown, setShowUnitDropdown] = useState(false);

  const [filterClientText, setFilterClientText] = useState('');
  const [showFilterClientDropdown, setShowFilterClientDropdown] = useState(false);
  const [appliedFilterClient, setAppliedFilterClient] = useState('');

  const [filterItemText, setFilterItemText] = useState('');
  const [showFilterItemDropdown, setShowFilterItemDropdown] = useState(false);
  const [appliedFilterItem, setAppliedFilterItem] = useState('');

  const [filterRate, setFilterRate] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchClientsAndItems();
  }, []);

  useEffect(() => {
    if (formData.clientId) {
      fetchClientItems(formData.clientId);
    } else {
      setClientPurchasedItems([]);
    }
  }, [formData.clientId]);

  const fetchClientItems = async (clientId: string) => {
    try {
      const res = await apiClient.api.clients[':id'].items.$get({ param: { id: clientId } });
      if (res.ok) {
        const data = await res.json() as any;
        setClientPurchasedItems(data.data || []);
      }
    } catch (e) {
      console.error('Error fetching client items:', e);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSalesRates();
    }, 300);
    return () => clearTimeout(timer);
  }, [currentPage, appliedFilterClient, appliedFilterItem, filterRate, globalSearch]);

  const fetchSalesRates = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.api['sales-rates'].$get({
        query: {
          page: currentPage.toString(),
          limit: itemsPerPage.toString(),
          clientFilter: appliedFilterClient,
          itemFilter: appliedFilterItem,
          rateFilter: filterRate,
          search: globalSearch
        }
      });
      if (res.ok) {
        const data = await res.json() as { data: any[], total: number };
        setSalesRates(data.data || []);
        setTotalCount(data.total || 0);
      }
    } catch (error) {
      console.error('Error fetching sales rates:', error);
      showError('Failed to load sales rates.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchClientsAndItems = async () => {
    try {
      const [itemsRes, unitsRes] = await Promise.all([
        apiClient.api.items.$get(),
        apiClient.api.settings['unit-conversions'].$get()
      ]);
      
      if (itemsRes.ok) {
        const iData = await itemsRes.json() as any;
        setItems(iData.data || iData || []);
      }
      
      if (unitsRes.ok) {
        const uData = await unitsRes.json() as any;
        setUnitConversions(uData.data || uData || []);
      }
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  };

  // Debounced client search for form
  useEffect(() => {
    if (!clientSearchText || formData.clientId) {
      setClientFormSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingFormClients(true);
      try {
        const res = await apiClient.api.clients.$get({ query: { search: clientSearchText, limit: '50' } });
        if (res.ok) {
          const data = await res.json() as any;
          setClientFormSearchResults(Array.isArray(data) ? data : data.data || []);
        }
      } catch (e) { console.error(e); }
      finally { setIsSearchingFormClients(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [clientSearchText, formData.clientId]);

  // Debounced client search for filters
  useEffect(() => {
    let ignore = false;
    
    if (!filterClientText) {
      setClientFilterSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.api.clients.$get({ query: { search: filterClientText, limit: '50' } });
        if (res.ok) {
          const data = await res.json() as any;
          if (!ignore) {
            setClientFilterSearchResults(Array.isArray(data) ? data : data.data || []);
          }
        }
      } catch (e) { console.error(e); }
    }, 300);
    
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [filterClientText]);

  const computedVatableValue = useMemo(() => {
    const sr = parseFloat(formData.salesRate);
    const vr = parseFloat(formData.vatRate);
    if (!isNaN(sr) && !isNaN(vr)) {
      return (sr / (1 + vr / 100)).toFixed(6);
    }
    return '';
  }, [formData.salesRate, formData.vatRate]);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(''), 5000);
  };

  const resetForm = () => {
    setIsEditing(false);
    setCurrentEditingId(null);
    setShowForm(false);
    setFormData({
      clientId: '',
      itemId: '',
      salesRate: '',
      vatRate: '',
      additionPercent: '',
      unitId: '',
      activationDate: todayDate
    });
    setClientSearchText('');
    setShowClientDropdown(false);
    setItemSearchText('');
    setShowItemDropdown(false);
  };

  const saveSalesRate = async () => {
    if (!formData.clientId || !formData.itemId || !formData.unitId || !formData.salesRate || !formData.vatRate) {
      showError('Please fill in all required fields.');
      return;
    }

    const selectedDate = new Date(formData.activationDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (selectedDate > today) {
      showError('Activation date cannot be in the future.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        vatableValue: computedVatableValue || '0'
      };
      
      if (isEditing && currentEditingId) {
        await apiClient.api['sales-rates'][':id'].$put({
          param: { id: currentEditingId.toString() },
          json: payload as any
        });
        showSuccess('Sales rate updated successfully!');
      } else {
        await apiClient.api['sales-rates'].$post({
          json: payload as any
        });
        showSuccess('Sales rate added successfully!');
      }
      
      resetForm();
      fetchSalesRates();
    } catch (error) {
      console.error('Error saving sales rate:', error);
      showError('Failed to save sales rate.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSalesRate = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this sales rate?')) return;
    try {
      await apiClient.api['sales-rates'][':id'].$delete({
        param: { id: id.toString() }
      });
      showSuccess('Sales rate deleted successfully!');
      fetchSalesRates();
    } catch (error) {
      console.error('Error deleting sales rate:', error);
      showError('Failed to delete sales rate.');
    }
  };

  const editRate = (rate: any) => {
    setIsEditing(true);
    setCurrentEditingId(rate.id);
    setShowForm(true);
    setFormData({
      clientId: rate.clientId.toString(),
      itemId: rate.itemId.toString(),
      unitId: rate.unitId ? rate.unitId.toString() : '',
      salesRate: rate.salesRate.toString(),
      vatRate: rate.vatRate.toString(),
      additionPercent: rate.additionPercent ? rate.additionPercent.toString() : '0',
      activationDate: new Date(rate.activationDate).toISOString().split('T')[0]
    });
    
    setClientSearchText(rate.clientName);
    setItemSearchText(rate.itemName);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filteredFormClients = clientFormSearchResults;

  const itemsToFilter = formData.clientId ? clientPurchasedItems : items;
  const filteredFormItems = !itemSearchText ? [] : itemsToFilter
    .filter(i => 
      i.name.toLowerCase().includes(itemSearchText.toLowerCase()) || 
      (i.hsCode && i.hsCode.toLowerCase().includes(itemSearchText.toLowerCase()))
    ).slice(0, 50);

  const filterDropdownClients = clientFilterSearchResults;

  const filterDropdownItems = !filterItemText ? [] : items
    .filter(i => 
      i.name.toLowerCase().includes(filterItemText.toLowerCase()) || 
      (i.hsCode && i.hsCode.toLowerCase().includes(filterItemText.toLowerCase()))
    ).slice(0, 50);

  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));
  const paginatedSalesRates = salesRates;

  const formatDateLabel = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="max-w-7xl mx-auto w-full pb-10">
      {successMessage && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-emerald-400 border-l-4 border-emerald-400 px-6 py-4 rounded-lg shadow-2xl z-50 animate-bounce">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-red-400 border-l-4 border-red-400 px-6 py-4 rounded-lg shadow-2xl z-50 animate-bounce">
          {errorMessage}
        </div>
      )}

      {/* Header and Add Button */}
      <div className="flex justify-between items-center mb-6 min-h-[42px]">
        <h2 className="text-2xl font-bold text-slate-100">Sales Rates</h2>
        <div className="flex items-center gap-4">
          {!showForm && (
            <div className="flex items-center px-4 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400 font-medium text-sm shadow-sm">
              Total Rates
              <span className="ml-2 bg-blue-500 text-white px-2 py-0.5 rounded text-xs font-bold shadow-sm">
                {totalCount}
              </span>
            </div>
          )}
          {!showForm && (
            <button 
              onClick={() => setShowForm(true)} 
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20"
            >
              <span>+</span> Add New Sales Rate
            </button>
          )}
        </div>
      </div>

      {/* Form Section */}
      {showForm && (
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-sm mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-700">
          <h3 className="text-xl font-bold text-slate-100">{isEditing ? 'Edit Sales Rate' : 'Add New Sales Rate'}</h3>
          
          <div className="flex items-center gap-4">
            
            <div className="flex gap-2">
              <button 
                onClick={resetForm} 
                className="px-4 py-2 border border-slate-600 text-slate-300 hover:text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button 
                onClick={saveSalesRate} 
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : (isEditing ? 'Update Rate' : 'Save Rate')}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <div className="relative">
            <label className="block text-sm font-medium text-slate-300 mb-1">Client</label>
            <input 
              type="text" 
              value={clientSearchText}
              disabled={isEditing}
              onChange={e => {
                setClientSearchText(e.target.value);
                setFormData({...formData, clientId: ''});
                setShowClientDropdown(e.target.value.length > 0);
              }}
              onFocus={() => {
                if (clientSearchText.length > 0 && !isEditing) setShowClientDropdown(true);
              }}
              onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
              className={`w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
              placeholder="Type to search..."
            />
                        {showClientDropdown && (
                          <div className="absolute top-full left-0 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-52 overflow-y-auto z-50">
                            {!clientSearchText ? (
                              <div className="px-4 py-3 text-slate-400 italic text-sm">Type to search for a client...</div>
                            ) : isSearchingFormClients ? (
                              <div className="px-4 py-3 text-slate-400 italic text-sm">Searching...</div>
                            ) : filteredFormClients.length > 0 ? filteredFormClients.map(c => (
                              <div key={c.id} className="px-4 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0" onMouseDown={() => {
                                setFormData(f => ({ ...f, clientId: c.id.toString() }));
                                setClientSearchText(c.name);
                                setShowClientDropdown(false);
                                setClientFormSearchResults([]);
                              }}>
                                <div className="font-medium text-slate-200">{c.name}</div>
                                {c.bin && <div className="text-xs text-slate-400">BIN: {c.bin}</div>}
                              </div>
                            )) : <div className="px-4 py-3 text-slate-400 italic text-sm">No clients found</div>}
                          </div>
                        )}
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-slate-300 mb-1">Item</label>
            <input 
              type="text" 
              value={itemSearchText}
              disabled={isEditing}
              onChange={e => {
                setItemSearchText(e.target.value);
                setFormData({...formData, itemId: ''});
                setShowItemDropdown(e.target.value.length > 0);
              }}
              onFocus={() => {
                if (itemSearchText.length > 0 && !isEditing) setShowItemDropdown(true);
              }}
              onBlur={() => setTimeout(() => setShowItemDropdown(false), 200)}
              className={`w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
              placeholder="Type to search..."
            />
            {showItemDropdown && (
              <div className="absolute top-full left-0 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
                {filteredFormItems.length > 0 ? filteredFormItems.map(item => (
                  <div key={item.id} className="px-4 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0" onMouseDown={() => {
                    setFormData({...formData, itemId: item.id.toString()});
                    setItemSearchText(item.name);
                    setShowItemDropdown(false);
                  }}>
                    <div className="font-medium text-slate-200">{item.name}</div>
                    <div className="text-xs text-slate-400">HS: {item.hsCode || 'N/A'}</div>
                  </div>
                )) : <div className="px-4 py-3 text-slate-400 italic text-sm">No items found</div>}
              </div>
            )}
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-slate-300 mb-1">Unit</label>
            <div 
              tabIndex={0}
              onBlur={() => setTimeout(() => setShowUnitDropdown(false), 200)}
              onClick={() => setShowUnitDropdown(!showUnitDropdown)}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer flex justify-between items-center min-h-[42px]"
            >
              <span className={`truncate ${formData.unitId === '' ? 'text-slate-400' : ''}`}>
                {formData.unitId === '' ? 'Select Unit' : (unitConversions.find(u => u.id.toString() === formData.unitId)?.salesUnit || 'Select Unit')}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </div>
            
            {showUnitDropdown && (
              <div className="absolute top-full left-0 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
                {unitConversions.map(u => (
                  <div 
                    key={u.id} 
                    className="px-4 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0 transition-colors" 
                    onMouseDown={() => { setFormData({...formData, unitId: u.id.toString()}); setShowUnitDropdown(false); }}
                  >
                    <div className="font-medium text-slate-200">{u.salesUnit}</div>
                    <div className="text-xs text-slate-400">From {u.purchaseUnit} (x{u.factor})</div>
                  </div>
                ))}
                {unitConversions.length === 0 && (
                  <div className="px-4 py-3 text-slate-400 italic text-sm">No units found</div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Sales Rate</label>
            <input 
              type="number" 
              step="0.01" 
              value={formData.salesRate} 
              onChange={e => setFormData({...formData, salesRate: e.target.value})}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
              placeholder="e.g. 1500.50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">VAT Rate (%)</label>
            <input 
              type="number" 
              step="0.01" 
              min="0"
              value={formData.vatRate} 
              onChange={e => setFormData({...formData, vatRate: e.target.value})}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
              placeholder="e.g. 15.00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Addition (%)</label>
            <input 
              type="number" 
              step="0.01" 
              min="0"
              value={formData.additionPercent} 
              onChange={e => setFormData({...formData, additionPercent: e.target.value})}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
              placeholder="e.g. 5.00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Vatable Value</label>
            <input 
              type="text" 
              value={computedVatableValue} 
              readOnly 
              disabled
              className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-400 cursor-not-allowed"
              placeholder="Auto-calculated"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Activation Date</label>
            <input 
              type="date" 
              value={formData.activationDate} 
              disabled={isEditing}
              onChange={e => setFormData({...formData, activationDate: e.target.value})}
              max={todayDate}
              className={`w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={{ colorScheme: 'dark' }}
            />
          </div>
        </div>
      </div>
      )}

      {/* Filters Section */}
      {!showForm && (
        <>
          <div className="flex flex-wrap items-center gap-4 mb-6 bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm z-10 relative">
        <div className="relative flex-1 min-w-[150px]">
          <input 
            type="text" 
            value={filterClientText} 
            onChange={e => {
              setFilterClientText(e.target.value);
              setAppliedFilterClient('');
              setCurrentPage(1);
              setShowFilterClientDropdown(e.target.value.length > 0);
            }} 
            onFocus={() => {
              if (filterClientText.length > 0) setShowFilterClientDropdown(true);
            }}
            onBlur={() => setTimeout(() => setShowFilterClientDropdown(false), 200)}
            className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
            placeholder="Filter by Client..."
          />
          {filterClientText && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" onClick={() => {
              setFilterClientText(''); setAppliedFilterClient(''); setCurrentPage(1);
            }}>✕</button>
          )}
          {showFilterClientDropdown && (
            <div className="absolute top-full left-0 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
              {filterDropdownClients.length > 0 ? filterDropdownClients.map(client => (
                <div key={client.id} className="px-4 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0" onMouseDown={() => {
                  setFilterClientText(client.name);
                  setAppliedFilterClient(client.name);
                  setShowFilterClientDropdown(false);
                }}>
                  <div className="font-medium text-slate-200">{client.name}</div>
                  <div className="text-xs text-slate-400">BIN: {client.bin || 'N/A'}</div>
                </div>
              )) : <div className="px-4 py-3 text-slate-400 italic text-sm">No clients found</div>}
            </div>
          )}
        </div>

        <div className="relative flex-1 min-w-[150px]">
          <input 
            type="text" 
            value={filterItemText} 
            onChange={e => {
              setFilterItemText(e.target.value);
              setAppliedFilterItem('');
              setCurrentPage(1);
              setShowFilterItemDropdown(e.target.value.length > 0);
            }} 
            onFocus={() => {
              if (filterItemText.length > 0) setShowFilterItemDropdown(true);
            }}
            onBlur={() => setTimeout(() => setShowFilterItemDropdown(false), 200)}
            className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
            placeholder="Filter by Item..."
          />
          {filterItemText && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" onClick={() => {
              setFilterItemText(''); setAppliedFilterItem(''); setCurrentPage(1);
            }}>✕</button>
          )}
          {showFilterItemDropdown && (
            <div className="absolute top-full left-0 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
              {filterDropdownItems.length > 0 ? filterDropdownItems.map(item => (
                <div key={item.id} className="px-4 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0" onMouseDown={() => {
                  setFilterItemText(item.name);
                  setAppliedFilterItem(item.name);
                  setShowFilterItemDropdown(false);
                }}>
                  <div className="font-medium text-slate-200">{item.name}</div>
                  <div className="text-xs text-slate-400">HS: {item.hsCode || 'N/A'}</div>
                </div>
              )) : <div className="px-4 py-3 text-slate-400 italic text-sm">No items found</div>}
            </div>
          )}
        </div>

        <input 
          type="text" 
          value={filterRate} 
          onChange={e => { setFilterRate(e.target.value); setCurrentPage(1); }} 
          placeholder="Filter by Rate..." 
          className="flex-1 min-w-[150px] px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
        />

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            value={globalSearch} 
            onChange={e => { setGlobalSearch(e.target.value); setCurrentPage(1); }} 
            placeholder="Search everywhere..." 
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400">Loading sales rates...</div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-sm overflow-hidden z-0 relative">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-900 border-b border-slate-700 text-slate-400 uppercase text-xs tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-semibold">Client</th>
                  <th className="px-4 py-3 font-semibold">Item</th>
                  <th className="px-4 py-3 font-semibold text-center">Unit</th>
                  <th className="px-4 py-3 font-semibold text-right">Sales Rate</th>
                  <th className="px-4 py-3 font-semibold text-right">VAT (%)</th>
                  <th className="px-4 py-3 font-semibold text-right">Addition (%)</th>
                  <th className="px-4 py-3 font-semibold">Activation Date</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {paginatedSalesRates.map(rate => (
                  <tr key={rate.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-200">{rate.clientName}</div>
                      {rate.clientBin && <div className="text-xs text-slate-500">BIN: {rate.clientBin}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-200">{rate.itemName}</div>
                      {rate.itemHsCode && <div className="text-xs text-slate-500">[{rate.itemHsCode}]</div>}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-300">
                      <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-xs border border-slate-700 font-medium">
                        {rate.unitName || 'Base'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-200">{Number(rate.salesRate).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{Number(rate.vatRate).toFixed(2)}%</td>
                    <td className="px-4 py-3 text-right text-slate-300">{rate.additionPercent ? Number(rate.additionPercent).toFixed(2) + '%' : '0.00%'}</td>
                    <td className="px-4 py-3">
                      <span className="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded text-xs font-semibold border border-emerald-500/20">
                        {formatDateLabel(rate.activationDate)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${rate.status === 'Frozen' ? 'bg-slate-700 text-slate-400 border border-slate-600' : 'bg-blue-500/20 text-blue-400 border border-blue-500/20'}`}>
                        {rate.status || 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {rate.status !== 'Frozen' ? (
                        <>
                          <button onClick={() => editRate(rate)} className="px-2 py-1 bg-slate-700 text-slate-300 hover:text-white rounded mr-2 transition-colors" title="Edit">✏️</button>
                          <button onClick={() => deleteSalesRate(rate.id)} className="px-2 py-1 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded transition-colors" title="Delete">🗑️</button>
                        </>
                      ) : (
                        <>
                          <button disabled className="px-2 py-1 bg-slate-800 text-slate-600 rounded mr-2 cursor-not-allowed" title="Frozen rates cannot be edited">✏️</button>
                          <button disabled className="px-2 py-1 bg-slate-800 text-slate-600 rounded cursor-not-allowed" title="Frozen rates cannot be deleted directly. Delete the active rate first.">🔒</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {paginatedSalesRates.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400 italic">No sales rates found matching your criteria.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-between items-center px-6 py-4 bg-slate-900 border-t border-slate-700">
              <button 
                onClick={() => setCurrentPage(c => c - 1)} 
                disabled={currentPage === 1} 
                className="px-4 py-2 border border-slate-600 bg-slate-800 text-slate-200 rounded font-medium hover:bg-slate-700 hover:border-blue-500 disabled:opacity-50 transition-all"
              >
                Previous
              </button>
              <span className="text-sm font-medium text-slate-400">Page {currentPage} of {totalPages}</span>
              <button 
                onClick={() => setCurrentPage(c => c + 1)} 
                disabled={currentPage === totalPages} 
                className="px-4 py-2 border border-slate-600 bg-slate-800 text-slate-200 rounded font-medium hover:bg-slate-700 hover:border-blue-500 disabled:opacity-50 transition-all"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}
