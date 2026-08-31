-- CreateEnum
CREATE TYPE "TipoTransacao" AS ENUM ('DESPESA', 'RECEITA');

-- CreateEnum
CREATE TYPE "MetodoPagamento" AS ENUM ('CREDITO', 'DEBITO', 'PIX', 'DINHEIRO', 'BOLETO');

-- CreateEnum
CREATE TYPE "StatusTransacao" AS ENUM ('ATIVA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusFatura" AS ENUM ('ABERTA', 'FECHADA', 'PAGA');

-- CreateEnum
CREATE TYPE "OrigemCredito" AS ENUM ('REEMBOLSO', 'ESTORNO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "BudgetCategory" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "corSlot" INTEGER NOT NULL,
    "arquivada" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BudgetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcategory" (
    "id" TEXT NOT NULL,
    "budgetCategoryId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "arquivada" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Subcategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetAllocation" (
    "id" TEXT NOT NULL,
    "budgetCategoryId" TEXT NOT NULL,
    "vigenteDe" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,

    CONSTRAINT "BudgetAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "diaFechamento" INTEGER NOT NULL,
    "diaVencimento" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "dataFechamento" TEXT NOT NULL,
    "dataVencimento" TEXT NOT NULL,
    "status" "StatusFatura" NOT NULL DEFAULT 'ABERTA',
    "pagaEm" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "tipo" "TipoTransacao" NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "metodo" "MetodoPagamento" NOT NULL,
    "cardId" TEXT,
    "invoiceId" TEXT,
    "budgetCategoryId" TEXT,
    "subcategoryId" TEXT,
    "competencia" TEXT NOT NULL,
    "status" "StatusTransacao" NOT NULL DEFAULT 'ATIVA',
    "reembolsoAlvoCentavos" INTEGER NOT NULL DEFAULT 0,
    "grupoParcelamentoId" TEXT,
    "parcelaNum" INTEGER NOT NULL DEFAULT 1,
    "parcelaTotal" INTEGER NOT NULL DEFAULT 1,
    "recorrenciaId" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credito" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "recebidoEm" TEXT NOT NULL,
    "competenciaCredito" TEXT NOT NULL,
    "origem" "OrigemCredito" NOT NULL,

    CONSTRAINT "Credito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpectedIncome" (
    "id" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,

    CONSTRAINT "ExpectedIncome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "diaDoMes" INTEGER NOT NULL,
    "budgetCategoryId" TEXT NOT NULL,
    "subcategoryId" TEXT NOT NULL,
    "metodo" "MetodoPagamento" NOT NULL,
    "cardId" TEXT,
    "inicio" TEXT NOT NULL,
    "fim" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetCategory_nome_key" ON "BudgetCategory"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Subcategory_budgetCategoryId_nome_key" ON "Subcategory"("budgetCategoryId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetAllocation_budgetCategoryId_vigenteDe_key" ON "BudgetAllocation"("budgetCategoryId", "vigenteDe");

-- CreateIndex
CREATE UNIQUE INDEX "Card_nome_key" ON "Card"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_cardId_competencia_key" ON "Invoice"("cardId", "competencia");

-- CreateIndex
CREATE INDEX "Transaction_competencia_idx" ON "Transaction"("competencia");

-- CreateIndex
CREATE INDEX "Transaction_grupoParcelamentoId_idx" ON "Transaction"("grupoParcelamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_recorrenciaId_competencia_key" ON "Transaction"("recorrenciaId", "competencia");

-- CreateIndex
CREATE INDEX "Credito_competenciaCredito_idx" ON "Credito"("competenciaCredito");

-- CreateIndex
CREATE INDEX "ExpectedIncome_competencia_idx" ON "ExpectedIncome"("competencia");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_budgetCategoryId_fkey" FOREIGN KEY ("budgetCategoryId") REFERENCES "BudgetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_budgetCategoryId_fkey" FOREIGN KEY ("budgetCategoryId") REFERENCES "BudgetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_budgetCategoryId_fkey" FOREIGN KEY ("budgetCategoryId") REFERENCES "BudgetCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recorrenciaId_fkey" FOREIGN KEY ("recorrenciaId") REFERENCES "RecurringExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credito" ADD CONSTRAINT "Credito_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_budgetCategoryId_fkey" FOREIGN KEY ("budgetCategoryId") REFERENCES "BudgetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;
