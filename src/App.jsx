import React, { useState, useEffect } from 'react';
import { Package, Search, CheckCircle, XCircle, AlertCircle, RefreshCw, Wand2, Database, ChevronRight, User, LogOut, Lock, Eye, EyeOff, Save, Layers, Hash, Calendar, ArrowRight, MapPin } from 'lucide-react';

// --- CONFIGURATION SUPABASE ---
// ⚠️ DÉCOMMENTEZ CES LIGNES POUR VOTRE PROJET STACKBLITZ / VERCEL
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// --- CONFIGURATION API IA (Gemini) ---
// ⚠️ DÉCOMMENTEZ CETTE LIGNE POUR VOTRE PROJET STACKBLITZ / VERCEL
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

// Composant pour écraser les marges par défaut de Vite/StackBlitz
const GlobalCssReset = () => (
  <style dangerouslySetInnerHTML={{__html: `
    #root { max-width: none !important; padding: 0 !important; margin: 0 !important; width: 100vw; height: 100vh; text-align: left !important; }
    body, html { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background-color: #f8fafc; }
  `}} />
);

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
  const [stats, setStats] = useState({ totalProcessed: 0 });

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
      setAuthError("Identifiants incorrects ou problème de connexion.");
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
    setFormData({
      designation: '',
      marque: '',
      reference_fabricant: '',
      groupe: '',
      famille: '',
      type: ''
    });
  };

  // 🤖 Moteur IA (Connexion à la vraie API Google Gemini)
  const runAIAnalysis = async () => {
    if (!selectedArticle) return;
    setIsProcessingAI(true);
    
    try {
      if (!GEMINI_API_KEY) {
        throw new Error("Clé API manquante. Ajoutez VITE_GEMINI_API_KEY sur Vercel.");
      }

      console.log("Démarrage de l'analyse IA...");

      // 1. On récupère l'image depuis Supabase
      console.log("Téléchargement de l'image :", selectedArticle.photo_url);
      const imageResponse = await fetch(selectedArticle.photo_url);
      if (!imageResponse.ok) {
          throw new Error("Impossible de télécharger l'image depuis le serveur.");
      }
      const imageBlob = await imageResponse.blob();
      
      // Conversion en Base64
      const base64Image = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(imageBlob);
      });

      console.log("Image convertie, envoi à Google Gemini...");

      // 2. Le "Prompt" (Nos consignes très strictes pour l'IA)
      const promptText = `Tu es un expert magasinier technique (bricolage, électricité, plomberie, quincaillerie, mécanique, etc.).
      Analyse l'image fournie et le code-barre scanné suivant : ${selectedArticle.code_barre}.
      Identifie cet article et déduis un maximum d'informations visibles sur la boîte, l'étiquette ou l'objet lui-même.
      IMPORTANT: Tu dois STRICTEMENT renvoyer un objet JSON valide, sans aucun texte ou formatage markdown (pas de \`\`\`json) autour.
      Respecte cette structure exacte :
      {
        "designation": "Nom complet et détaillé de l'article (ex: Perceuse visseuse sans fil 12V)",
        "marque": "Nom du fabricant (ex: Bosch, Schneider, etc.) ou 'Inconnue' si impossible à déterminer",
        "reference_fabricant": "La référence exacte du produit lue sur la photo ou déduite, sinon 'N/A'",
        "groupe": "Choisis LA catégorie la plus logique parmi: Électricité, Outillage, Plomberie, Quincaillerie, Mécanique, Consommable",
        "famille": "Sous-catégorie cohérente (ex: Tableau électrique, Visserie, Raccords)",
        "type": "Type précis (ex: Disjoncteur, Perceuse, Cheville)"
      }`;

      // 3. Appel à l'API Google Gemini 1.5 Flash
      // Correction de l'URL de l'API (ajout de /v1beta/models/...)
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      
      const requestBody = {
          contents: [{
              parts: [
                  { text: promptText },
                  { 
                      inlineData: { 
                          mimeType: imageBlob.type || "image/jpeg", 
                          data: base64Image 
                      } 
                  }
              ]
          }],
          generationConfig: { 
              responseMimeType: "application/json" 
          }
      };

      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
      });

      // 4. Gestion des erreurs de l'API Google
      if (!response.ok) {
          const errorData = await response.json();
          console.error("Erreur API Gemini:", errorData);
          throw new Error(`Erreur API Google: ${errorData?.error?.message || response.statusText}`);
      }

      // 5. Traitement de la réponse
      const result = await response.json();
      console.log("Réponse brute de Gemini:", result);

      if (!result.candidates || result.candidates.length === 0) {
           throw new Error("L'IA n'a renvoyé aucun résultat.");
      }

      const aiText = result.candidates[0].content.parts[0].text;
      
      // Parfois Gemini rajoute quand même des backticks malgré les consignes
      const cleanJsonText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const aiData = JSON.parse(cleanJsonText);
      console.log("Données parsées:", aiData);

      // 6. Remplissage automatique du formulaire
      setFormData({
        designation: aiData.designation || '',
        marque: aiData.marque || '',
        reference_fabricant: aiData.reference_fabricant || '',
        groupe: aiData.groupe || '',
        famille: aiData.famille || '',
        type: aiData.type || ''
      });

      showToast("Analyse IA terminée avec succès !");
    } catch(e) {
      console.error("Détail du crash IA:", e);
      showToast(e.message || "Erreur lors de l'analyse IA.");
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
        statut: 'Actif',
        site_rattachement: selectedArticle.magasin
      };

      const { error: insertError } = await supabase.from('articles').insert([newArticle]);
      if (insertError) throw insertError;

      // 2. Supprimer de la file d'attente (table 'articles_a_creer')
      const { error: deleteError } = await supabase
        .from('articles_a_creer')
        .delete()
        .eq('id', selectedArticle.id);
      if (deleteError) throw deleteError;

      setStats(prev => ({ ...prev, totalProcessed: prev.totalProcessed + 1 }));
      showToast(`L'article ${newArticle.code_barre} a été ajouté au catalogue !`);
      setSelectedArticle(null);
      fetchPendingArticles();

    } catch (e) {
      console.error("Erreur lors de l'enregistrement :", e);
      showToast("Erreur lors de la sauvegarde : " + e.message);
    }
  };

  const handleRejectArticle = async () => {
    if (!supabase || !selectedArticle) return;
    if (!window.confirm("Voulez-vous vraiment rejeter cette demande ? Elle sera supprimée définitivement.")) return;

    try {
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

  // VUE 1 : AVERTISSEMENT CONFIGURATION
  if (!supabase) {
    return (
      <>
        <GlobalCssReset />
        <div className="flex h-screen w-full items-center justify-center bg-slate-50 text-slate-800 p-8">
          <div className="bg-white p-10 rounded-2xl max-w-lg w-full text-center border border-slate-200 shadow-2xl">
            <Database size={72} className="mx-auto text-emerald-500 mb-6" />
            <h1 className="text-3xl font-black mb-4">Base de données requise</h1>
            <p className="text-slate-500 text-lg">
              Veuillez configurer <strong>VITE_SUPABASE_URL</strong> et <strong>VITE_SUPABASE_ANON_KEY</strong> dans les variables d'environnement Vercel.
            </p>
          </div>
        </div>
      </>
    );
  }

  // VUE 2 : ÉCRAN DE CONNEXION (Style TechScan Sombre)
  if (!session) {
    return (
      <>
        <GlobalCssReset />
        <div className="flex h-screen w-full items-center justify-center bg-slate-900 p-6">
          <div className="bg-slate-800 p-8 md:p-10 rounded-[2.5rem] max-w-md w-full shadow-2xl border border-slate-700 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 bg-emerald-600 rounded-3xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Database size={40} className="text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-extrabold text-white text-center mb-2">Back-Office</h1>
            <p className="text-slate-400 text-center mb-8">Connectez-vous pour gérer le catalogue</p>
            
            {authError && <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-2xl mb-6 text-sm text-center">{authError}</div>}
            
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="text-slate-300 text-sm font-bold mb-2 block">Identifiant (Email)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500"><User size={20} /></div>
                  <input type="email" required className="w-full bg-slate-900 border border-slate-700 text-white rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-emerald-500 transition-colors" placeholder="expert@techscan.fr" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-slate-300 text-sm font-bold mb-2 block">Mot de passe</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500"><Lock size={20} /></div>
                  <input type={showPassword ? "text" : "password"} required className="w-full bg-slate-900 border border-slate-700 text-white rounded-2xl py-4 pl-12 pr-12 focus:outline-none focus:border-emerald-500 transition-colors" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-300 transition-colors">
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={authLoading} className="w-full py-4 mt-4 bg-emerald-600 rounded-2xl text-white text-lg font-bold shadow-lg shadow-emerald-500/30 hover:bg-emerald-500 active:scale-[0.98] transition-all disabled:opacity-50">
                {authLoading ? 'Connexion...' : 'Se connecter'}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  // VUE 3 : LE DASHBOARD BACK-OFFICE FULL-SCREEN
  return (
    <>
      <GlobalCssReset />
      <div className="flex flex-col h-screen w-full bg-slate-100 font-sans text-slate-800 overflow-hidden">
        
        {/* Notifications Toasts */}
        {toastMessage && (
          <div className="absolute top-20 right-8 bg-slate-800 text-white px-6 py-4 rounded-xl shadow-2xl z-50 font-bold text-sm flex items-center gap-3 animate-in slide-in-from-right">
             <CheckCircle size={20} className="text-emerald-400"/> {toastMessage}
          </div>
        )}

        {/* TOP NAVBAR */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-20 shadow-sm w-full">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center shadow-sm">
              <Database size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-800 leading-tight">TechScan</h1>
              <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest">Back-Office Référencement</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-2 text-sm font-medium text-slate-500 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
              <CheckCircle size={16} className="text-emerald-500" />
              <span>{stats.totalProcessed} traités session</span>
            </div>
            <div className="w-px h-8 bg-slate-200"></div>
            <div className="flex items-center gap-3">
               <div className="w-9 h-9 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-bold">
                  <User size={18}/>
               </div>
               <button onClick={handleLogout} className="text-sm font-bold text-slate-500 hover:text-red-600 transition-colors flex items-center gap-2">
                 Déconnexion <LogOut size={16}/>
               </button>
            </div>
          </div>
        </header>

        {/* CORPS DU DASHBOARD */}
        <div className="flex-1 flex overflow-hidden w-full">
          
          {/* Colonne de gauche : File d'attente (Largeur fixe) */}
          <aside className="w-80 lg:w-[350px] bg-white border-r border-slate-200 flex flex-col z-10 shrink-0 shadow-sm h-full">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
               <div>
                 <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                   <Package size={20} className="text-emerald-600" /> File d'attente
                 </h2>
                 <p className="text-xs text-slate-500 font-medium mt-1">{pendingArticles.length} article(s) inconnu(s)</p>
               </div>
               <button onClick={fetchPendingArticles} className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-emerald-600 hover:border-emerald-300 transition-colors shadow-sm" title="Rafraîchir">
                 <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
               </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                  <RefreshCw size={24} className="animate-spin mb-3" />
                  <p className="text-sm font-medium">Chargement...</p>
                </div>
              ) : pendingArticles.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <CheckCircle size={56} className="mx-auto mb-4 text-emerald-200" />
                  <p className="font-bold text-lg text-slate-600">Aucun article en attente</p>
                  <p className="text-sm mt-1">Le catalogue est à jour !</p>
                </div>
              ) : (
                pendingArticles.map(article => (
                  <div 
                    key={article.id} 
                    onClick={() => handleSelectArticle(article)}
                    className={`p-3.5 rounded-xl border flex gap-4 cursor-pointer transition-all ${selectedArticle?.id === article.id ? 'bg-emerald-50 border-emerald-400 shadow-md ring-1 ring-emerald-500/20' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}
                  >
                    <div className="w-16 h-16 bg-white rounded-lg overflow-hidden shrink-0 border border-slate-100 shadow-sm p-1">
                      <img src={article.photo_url} alt="Scan" className="w-full h-full object-cover rounded" />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <p className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-widest mb-1 flex items-center gap-1">
                        <MapPin size={10} /> {article.magasin}
                      </p>
                      <p className="font-mono font-bold text-slate-800 truncate text-sm">{article.code_barre}</p>
                      <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1 font-medium">
                        <Calendar size={10} /> {new Date(article.created_at).toLocaleDateString('fr-FR', {day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit'})}
                      </p>
                    </div>
                    <ChevronRight size={20} className={`self-center ${selectedArticle?.id === article.id ? 'text-emerald-600' : 'text-slate-300'}`} />
                  </div>
                ))
              )}
            </div>
          </aside>

          {/* Zone Principale : Espace de travail Fluide */}
          <main className="flex-1 relative overflow-y-auto p-6 lg:p-8 w-full h-full">
             {!selectedArticle ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                   <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-200 mb-6">
                      <Wand2 size={48} className="text-slate-300" />
                   </div>
                   <h2 className="text-2xl font-extrabold text-slate-600 mb-2">Espace de Référencement</h2>
                   <p className="text-lg text-slate-500">Sélectionnez un article dans la liste de gauche pour l'analyser.</p>
                </div>
             ) : (
                <div className="w-full h-full flex flex-col xl:flex-row gap-6 xl:gap-8 animate-in fade-in zoom-in-95 duration-300">
                   
                   {/* COLONNE PHOTO & IA */}
                   <div className="w-full xl:w-5/12 flex flex-col gap-6 h-full">
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-2/3">
                         <div className="flex justify-between items-center mb-4 shrink-0">
                           <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Image Source</h3>
                           <span className="text-slate-700 font-mono font-bold bg-slate-100 px-3 py-1 rounded-lg border border-slate-200 flex items-center gap-2">
                             <Hash size={14} className="text-slate-400"/> {selectedArticle.code_barre}
                           </span>
                         </div>
                         <div className="bg-slate-900 rounded-xl overflow-hidden flex-1 flex items-center justify-center relative shadow-inner w-full min-h-0">
                            <img src={selectedArticle.photo_url} alt="Pièce" className="max-w-full max-h-full object-contain" />
                         </div>
                      </div>

                      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-6 rounded-2xl border border-indigo-100 shadow-inner flex flex-col items-center text-center h-1/3 justify-center">
                         <Wand2 size={32} className="text-indigo-500 mb-3" />
                         <h4 className="font-bold text-indigo-900 mb-1">Assistant Intelligence Artificielle</h4>
                         <p className="text-sm text-indigo-700/80 mb-5">L'IA va analyser l'image pour pré-remplir la fiche produit.</p>
                         
                         <button 
                            onClick={runAIAnalysis}
                            disabled={isProcessingAI}
                            className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-lg shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-3 hover:shadow-indigo-500/50 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100"
                         >
                            {isProcessingAI ? (
                               <><RefreshCw size={24} className="animate-spin" /> Analyse en cours...</>
                            ) : (
                               <><Wand2 size={24} /> Analyser et Pré-remplir</>
                            )}
                         </button>
                      </div>
                   </div>

                   {/* COLONNE FORMULAIRE DE VALIDATION */}
                   <div className="w-full xl:w-7/12 flex flex-col h-full">
                      <div className="bg-white p-6 lg:p-8 rounded-2xl shadow-lg border border-slate-200 flex-1 flex flex-col h-full overflow-y-auto">
                         <div className="flex items-center gap-3 mb-8 border-b border-slate-100 pb-5 shrink-0">
                            <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                               <Database size={20} />
                            </div>
                            <div>
                              <h3 className="text-2xl font-black text-slate-800">Fiche Catalogue</h3>
                              <p className="text-sm text-slate-500 font-medium">Vérifiez et complétez les informations.</p>
                            </div>
                         </div>
                         
                         <div className="space-y-6 flex-1">
                            {/* SECTION INFO PRINCIPALES */}
                            <div className="space-y-5">
                              <div>
                                 <label className="text-slate-700 text-xs font-extrabold mb-2 flex items-center gap-1 uppercase tracking-wider">
                                   Désignation complète <span className="text-red-500">*</span>
                                 </label>
                                 <input 
                                    type="text" 
                                    value={formData.designation} 
                                    onChange={(e) => setFormData({...formData, designation: e.target.value})}
                                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-bold text-lg rounded-xl py-3 px-4 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors shadow-sm"
                                    placeholder="Ex: Perceuse visseuse 12V..."
                                 />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                 <div>
                                    <label className="text-slate-700 text-xs font-extrabold mb-2 block uppercase tracking-wider">Marque <span className="text-red-500">*</span></label>
                                    <input 
                                       type="text" 
                                       value={formData.marque} 
                                       onChange={(e) => setFormData({...formData, marque: e.target.value})}
                                       className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-semibold rounded-xl py-3 px-4 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors shadow-sm"
                                    />
                                 </div>
                                 <div>
                                    <label className="text-slate-700 text-xs font-extrabold mb-2 block uppercase tracking-wider">Réf. Fabricant</label>
                                    <input 
                                       type="text" 
                                       value={formData.reference_fabricant} 
                                       onChange={(e) => setFormData({...formData, reference_fabricant: e.target.value})}
                                       className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-mono text-sm rounded-xl py-3 px-4 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors shadow-sm"
                                    />
                                 </div>
                              </div>
                            </div>

                            <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent my-4"></div>

                            {/* SECTION CLASSIFICATION */}
                            <div>
                              <h4 className="text-sm font-bold text-slate-500 mb-4 flex items-center gap-2 uppercase tracking-widest"><Layers size={16}/> Classification</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                 <div>
                                    <label className="text-slate-600 text-xs font-bold mb-1.5 block">Groupe</label>
                                    <input type="text" value={formData.groupe} onChange={(e) => setFormData({...formData, groupe: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-lg py-2.5 px-3 focus:bg-white focus:border-emerald-400 focus:outline-none" />
                                 </div>
                                 <div>
                                    <label className="text-slate-600 text-xs font-bold mb-1.5 block">Famille</label>
                                    <input type="text" value={formData.famille} onChange={(e) => setFormData({...formData, famille: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-lg py-2.5 px-3 focus:bg-white focus:border-emerald-400 focus:outline-none" />
                                 </div>
                                 <div>
                                    <label className="text-slate-600 text-xs font-bold mb-1.5 block">Type</label>
                                    <input type="text" value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-lg py-2.5 px-3 focus:bg-white focus:border-emerald-400 focus:outline-none" />
                                 </div>
                              </div>
                            </div>
                         </div>

                         {/* ACTIONS FINALES */}
                         <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row gap-4 shrink-0">
                            <button 
                               onClick={handleRejectArticle}
                               className="px-6 py-4 rounded-xl border-2 border-red-100 text-red-600 font-bold hover:bg-red-50 hover:border-red-200 transition-all flex items-center justify-center gap-2"
                               title="Supprimer la demande"
                            >
                               <XCircle size={22} /> Rejeter
                            </button>
                            <button 
                               onClick={handleSaveToCatalog}
                               className="flex-1 py-4 rounded-xl bg-emerald-600 text-white font-extrabold text-lg shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-3 hover:bg-emerald-500 active:scale-[0.98] transition-all"
                            >
                               Approuver et Ajouter au Catalogue <ArrowRight size={22} />
                            </button>
                         </div>

                      </div>
                   </div>

                </div>
             )}
          </main>

        </div>
      </div>
    </>
  );
}