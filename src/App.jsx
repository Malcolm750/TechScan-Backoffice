import React, { useState, useEffect } from 'react';
import { Package, Search, CheckCircle, XCircle, AlertCircle, RefreshCw, Wand2, Database, ChevronRight, User, LogOut, Lock, Eye, EyeOff, Save } from 'lucide-react';

// --- CONFIGURATION SUPABASE ---
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
// // On active le client Supabase si les variables sont présentes
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// --- CONFIGURATION API IA (Gemini) ---
// Pour la production, il faudra une vraie clé API sécurisée (idéalement via Edge Functions)
// const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

export default function BackOfficeApp() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // États du Back-Office
  const [pendingArticles, setPendingArticles] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // État du formulaire d'édition
  const [formData, setFormData] = useState({
    designation: '',
    marque: '',
    reference_fabricant: '',
    groupe: '',
    famille: '',
    type: ''
  });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // --- 1. AUTHENTIFICATION ---
  useEffect(() => {
    if (!supabase) {
        setIsLoading(false);
        return;
    }
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchPendingArticles();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchPendingArticles();
      else setPendingArticles([]);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (error) {
      setAuthError("Identifiants incorrects.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  // --- 2. LOGIQUE MÉTIER : FETCH ET IA ---
  const fetchPendingArticles = async () => {
    if (!supabase) return;
    setIsLoading(true);
    try {
      // On récupère tous les articles en attente, triés du plus ancien au plus récent
      const { data, error } = await supabase
        .from('articles_a_creer')
        .select('*')
        .eq('statut', 'en_attente')
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      setPendingArticles(data || []);
    } catch (e) {
      console.error("Erreur fetch articles en attente:", e);
      showToast("Erreur de connexion à la base de données.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectArticle = (article) => {
    setSelectedArticle(article);
    // Réinitialiser le formulaire
    setFormData({
      designation: '',
      marque: '',
      reference_fabricant: '',
      groupe: '',
      famille: '',
      type: ''
    });
  };

  // 🤖 Moteur IA (Simulation pour le moment, à brancher sur Gemini Vision)
  const runAIAnalysis = async () => {
    if (!selectedArticle) return;
    setIsProcessingAI(true);
    
    // --- ICI SERA BRANCHÉE LA VRAIE API GEMINI ---
    // En attendant, on simule un temps de réflexion et des données plausibles
    try {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simule 2s de réflexion
      
      // Simulation d'une réponse JSON de l'IA
      const aiResponse = {
        designation: "Disjoncteur modulaire détecté automatiquement",
        marque: "Schneider Electric",
        reference_fabricant: selectedArticle.code_barre.substring(0, 6), // Fausse ref basée sur le code
        groupe: "ELECTRICITE",
        famille: "Tableau",
        type: "Protection"
      };

      setFormData(aiResponse);
      showToast("Analyse IA terminée avec succès !");
      
    } catch(e) {
      showToast("Erreur de l'analyse IA.");
    } finally {
      setIsProcessingAI(false);
    }
  };

  // --- 3. VALIDATION ET TRANSFERT ---
  const handleSaveToCatalog = async () => {
    if (!supabase || !selectedArticle) return;
    if (!formData.designation || !formData.marque) {
      showToast("Veuillez remplir au moins la désignation et la marque.");
      return;
    }

    try {
      // 1. Insérer dans le catalogue officiel (table 'articles')
      const newArticle = {
        code_barre: selectedArticle.code_barre,
        designation: formData.designation,
        marque: formData.marque,
        reference_fabricant: formData.reference_fabricant,
        groupe: formData.groupe,
        famille: formData.famille,
        type: formData.type,
        photo_url: selectedArticle.photo_url,
        statut: 'Actif', // L'article devient immédiatement utilisable par les tablettes
        site_rattachement: selectedArticle.magasin // On garde le magasin d'origine
      };

      const { error: insertError } = await supabase.from('articles').insert([newArticle]);
      if (insertError) throw insertError;

      // 2. Supprimer de la file d'attente (table 'articles_a_creer')
      const { error: deleteError } = await supabase
        .from('articles_a_creer')
        .delete()
        .eq('id', selectedArticle.id);
      if (deleteError) throw deleteError;

      // 3. Mettre à jour l'UI
      showToast(`L'article ${newArticle.code_barre} a été ajouté au catalogue !`);
      setSelectedArticle(null);
      fetchPendingArticles(); // Rafraîchir la liste

    } catch (e) {
      console.error("Erreur lors de l'enregistrement :", e);
      showToast("Erreur lors de la sauvegarde : " + e.message);
    }
  };

  const handleRejectArticle = async () => {
    if (!supabase || !selectedArticle) return;
    if (!window.confirm("Voulez-vous vraiment rejeter cette demande ? Elle sera supprimée définitivement.")) return;

    try {
      // On peut soit supprimer, soit passer le statut à 'rejete'
      const { error } = await supabase
        .from('articles_a_creer')
        .delete()
        .eq('id', selectedArticle.id);
        
      if (error) throw error;

      showToast("Demande supprimée.");
      setSelectedArticle(null);
      fetchPendingArticles();
    } catch(e) {
      showToast("Erreur lors de la suppression.");
    }
  };

  // --- VUES ---
  if (!supabase) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-100 text-slate-800 p-8">
        <div className="bg-white p-8 rounded-xl max-w-md w-full text-center border border-slate-200 shadow-xl">
          <Database size={64} className="mx-auto text-blue-500 mb-6" />
          <h1 className="text-2xl font-bold mb-4">Configuration Requise</h1>
          <p className="text-slate-500">Les variables d'environnement Supabase ne sont pas détectées ou sont invalides.</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 p-6">
        <div className="bg-white p-10 rounded-2xl max-w-md w-full shadow-xl border border-slate-100">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Database size={32} className="text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-black text-slate-800 text-center mb-2">Back-Office TechScan</h1>
          <p className="text-slate-500 text-center text-sm mb-8">Module de référencement & IA</p>

          {authError && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-6 text-sm border border-red-100">{authError}</div>}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-slate-600 text-xs font-bold mb-1 block uppercase tracking-wide">Email</label>
              <input type="email" required className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-lg py-3 px-4 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-slate-600 text-xs font-bold mb-1 block uppercase tracking-wide">Mot de passe</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} required className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-lg py-3 px-4 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-700 transition-colors">
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={authLoading} className="w-full py-3.5 mt-6 bg-emerald-600 rounded-lg text-white font-bold shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50">
              {authLoading ? 'Connexion...' : 'Accéder au Back-Office'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-slate-100 font-sans text-slate-800 overflow-hidden">
      
      {/* Toasts */}
      {toastMessage && (
        <div className="absolute top-6 right-6 bg-slate-800 text-white px-6 py-4 rounded-xl shadow-2xl z-50 font-bold text-sm flex items-center gap-3 animate-in slide-in-from-right">
           <CheckCircle size={18} className="text-emerald-400"/> {toastMessage}
        </div>
      )}

      {/* Colonne de gauche : File d'attente */}
      <div className="w-96 bg-white border-r border-slate-200 flex flex-col z-10 shadow-sm shrink-0">
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
           <div>
             <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
               <Package className="text-emerald-600" /> À référencer
             </h2>
             <p className="text-sm text-slate-500 font-medium mt-1">{pendingArticles.length} article(s) en attente</p>
           </div>
           <button onClick={fetchPendingArticles} className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-200 transition-colors shadow-sm" title="Rafraîchir">
             <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
           </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <p className="text-center text-slate-400 py-10">Chargement...</p>
          ) : pendingArticles.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <CheckCircle size={48} className="mx-auto mb-3 opacity-30" />
              <p>La file d'attente est vide.</p>
              <p className="text-sm">Bon travail !</p>
            </div>
          ) : (
            pendingArticles.map(article => (
              <div 
                key={article.id} 
                onClick={() => handleSelectArticle(article)}
                className={`p-3 rounded-xl border flex gap-4 cursor-pointer transition-all ${selectedArticle?.id === article.id ? 'bg-emerald-50 border-emerald-300 shadow-sm ring-1 ring-emerald-500/20' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}
              >
                <div className="w-16 h-16 bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-200">
                  <img src={article.photo_url} alt="Scan" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0 py-1">
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Magasin : {article.magasin}</p>
                  <p className="font-mono font-bold text-slate-700 truncate">{article.code_barre}</p>
                  <p className="text-xs text-slate-400 mt-1">{new Date(article.created_at).toLocaleDateString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</p>
                </div>
                <ChevronRight size={18} className={`self-center ${selectedArticle?.id === article.id ? 'text-emerald-600' : 'text-slate-300'}`} />
              </div>
            ))
          )}
        </div>

        {/* Profil & Déconnexion */}
        <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between shrink-0">
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-600"><User size={16}/></div>
              <span className="text-sm font-bold text-slate-700">Back-Office</span>
           </div>
           <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-600 transition-colors"><LogOut size={18}/></button>
        </div>
      </div>

      {/* Zone Principale : Espace de travail IA */}
      <div className="flex-1 bg-slate-100 relative overflow-y-auto p-8">
         {!selectedArticle ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
               <Wand2 size={80} className="mb-6 opacity-20" />
               <h2 className="text-2xl font-bold text-slate-500 mb-2">Espace de Référencement</h2>
               <p className="text-lg">Sélectionnez un article dans la file d'attente pour commencer.</p>
            </div>
         ) : (
            <div className="max-w-5xl mx-auto flex flex-col xl:flex-row gap-8 animate-in fade-in zoom-in-95 duration-300">
               
               {/* PANNEAU GAUCHE : VISUEL & INFOS BRUTES */}
               <div className="w-full xl:w-1/2 flex flex-col gap-6">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                     <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex justify-between">
                        <span>Photo scannée</span>
                        <span className="text-slate-600 font-mono bg-slate-100 px-2 py-0.5 rounded">{selectedArticle.code_barre}</span>
                     </h3>
                     <div className="bg-slate-900 rounded-xl overflow-hidden aspect-[4/3] flex items-center justify-center relative shadow-inner">
                        <img src={selectedArticle.photo_url} alt="Pièce" className="max-w-full max-h-full object-contain" />
                     </div>
                  </div>

                  {/* Bouton IA magique */}
                  <button 
                     onClick={runAIAnalysis}
                     disabled={isProcessingAI}
                     className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 text-white font-bold text-lg shadow-lg shadow-purple-500/30 flex items-center justify-center gap-3 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                     {isProcessingAI ? (
                        <><RefreshCw size={24} className="animate-spin" /> Analyse IA en cours...</>
                     ) : (
                        <><Wand2 size={24} /> Identifier avec l'IA</>
                     )}
                  </button>
               </div>

               {/* PANNEAU DROIT : FORMULAIRE DE VALIDATION */}
               <div className="w-full xl:w-1/2">
                  <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                     <h3 className="text-xl font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">Fiche Produit (Catalogue)</h3>
                     
                     <div className="space-y-5">
                        <div>
                           <label className="text-slate-600 text-xs font-bold mb-1.5 block uppercase tracking-wide">Désignation complète <span className="text-red-500">*</span></label>
                           <input 
                              type="text" 
                              value={formData.designation} 
                              onChange={(e) => setFormData({...formData, designation: e.target.value})}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-medium rounded-lg py-2.5 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                              placeholder="Ex: Perceuse visseuse 12V..."
                           />
                        </div>

                        <div className="grid grid-cols-2 gap-5">
                           <div>
                              <label className="text-slate-600 text-xs font-bold mb-1.5 block uppercase tracking-wide">Marque <span className="text-red-500">*</span></label>
                              <input 
                                 type="text" 
                                 value={formData.marque} 
                                 onChange={(e) => setFormData({...formData, marque: e.target.value})}
                                 className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-medium rounded-lg py-2.5 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                              />
                           </div>
                           <div>
                              <label className="text-slate-600 text-xs font-bold mb-1.5 block uppercase tracking-wide">Réf. Fabricant</label>
                              <input 
                                 type="text" 
                                 value={formData.reference_fabricant} 
                                 onChange={(e) => setFormData({...formData, reference_fabricant: e.target.value})}
                                 className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-mono text-sm rounded-lg py-2.5 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                              />
                           </div>
                        </div>

                        <div className="h-px bg-slate-100 my-2"></div>

                        <div className="grid grid-cols-3 gap-4">
                           <div>
                              <label className="text-slate-600 text-xs font-bold mb-1.5 block uppercase tracking-wide">Groupe</label>
                              <input type="text" value={formData.groupe} onChange={(e) => setFormData({...formData, groupe: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg py-2.5 px-3" />
                           </div>
                           <div>
                              <label className="text-slate-600 text-xs font-bold mb-1.5 block uppercase tracking-wide">Famille</label>
                              <input type="text" value={formData.famille} onChange={(e) => setFormData({...formData, famille: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg py-2.5 px-3" />
                           </div>
                           <div>
                              <label className="text-slate-600 text-xs font-bold mb-1.5 block uppercase tracking-wide">Type</label>
                              <input type="text" value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg py-2.5 px-3" />
                           </div>
                        </div>
                     </div>

                     <div className="mt-10 flex gap-4">
                        <button 
                           onClick={handleRejectArticle}
                           className="px-6 py-3 rounded-xl border-2 border-red-200 text-red-600 font-bold hover:bg-red-50 transition-colors flex items-center gap-2"
                        >
                           <XCircle size={20} /> Rejeter
                        </button>
                        <button 
                           onClick={handleSaveToCatalog}
                           className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold text-lg shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 hover:bg-emerald-500 active:scale-95 transition-all"
                        >
                           <Save size={20} /> Enregistrer au Catalogue
                        </button>
                     </div>

                  </div>
               </div>

            </div>
         )}
      </div>

    </div>
  );
}